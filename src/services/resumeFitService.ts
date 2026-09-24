import mongoose from "mongoose";
import Job, { coerceJobArrays } from "../models/jobModel.js";
import { analyzeResumeAgainstJob, rewriteResumeForJob } from "./resumeFitAIService.js";
import { extractResumeTextFromUpload } from "../utils/resumeTextExtract.js";
import { HttpError } from "../utils/http.js";

function buildJobContext(job: {
  title: string;
  company: string;
  location: string;
  type: string;
  description: string;
  requirements?: string[];
  benefits?: string[];
  salary: { min: number; max: number; currency: string };
}): string {
  const req = job.requirements?.length
    ? job.requirements.map((r) => `- ${r}`).join("\n")
    : "(none listed)";
  const ben = job.benefits?.length ? job.benefits.map((b) => `- ${b}`).join("\n") : "(none listed)";
  return `Title: ${job.title}
Company: ${job.company}
Location: ${job.location}
Type: ${job.type}
Salary: ${job.salary.currency} ${job.salary.min} - ${job.salary.max}

Description:
${job.description}

Requirements:
${req}

Benefits:
${ben}`;
}

/** Translates the AI service's plain Error into the right HTTP status — 503 when the
 * provider isn't configured at all, 502 for any other failure (bad response, timeout, etc). */
function rethrowAsHttpError(e: unknown, notConfiguredMessage: string): never {
  const msg = e instanceof Error ? e.message : "Request failed";
  if (msg.includes("Resume-fit AI is not configured")) {
    throw new HttpError(503, "SERVICE_UNAVAILABLE", notConfiguredMessage);
  }
  throw new HttpError(502, "INTERNAL_ERROR", msg);
}

async function resolveJobContext(
  jobId: string,
  jobDescriptionExtra: string,
  joiner: string,
): Promise<string> {
  if (!jobId) return jobDescriptionExtra;

  if (!mongoose.Types.ObjectId.isValid(jobId)) {
    throw new HttpError(400, "BAD_REQUEST", "Invalid job id");
  }
  const jobRaw = await Job.findById(jobId).lean();
  if (!jobRaw) {
    throw new HttpError(404, "NOT_FOUND", "Job not found");
  }
  const job = coerceJobArrays(jobRaw as Record<string, unknown>);
  const base = buildJobContext(job as Parameters<typeof buildJobContext>[0]);
  return jobDescriptionExtra ? `${base}${joiner}${jobDescriptionExtra}` : base;
}

export type AnalyzeResumeFitInput = {
  jobId: string;
  jobDescription: string;
  resumeText: string;
  file?: { buffer: Buffer; mimetype: string; originalname: string };
};

export async function analyzeResumeFit(input: AnalyzeResumeFitInput) {
  let resumeText = input.resumeText;

  if (input.file?.buffer) {
    const extracted = await extractResumeTextFromUpload(
      input.file.buffer,
      input.file.mimetype,
      input.file.originalname,
    );
    if (!extracted.ok) {
      throw new HttpError(400, "BAD_REQUEST", extracted.message);
    }
    resumeText = extracted.text;
  }

  if (resumeText.length < 80) {
    throw new HttpError(
      400,
      "BAD_REQUEST",
      "CV text is too short. Paste at least ~80 characters or upload a PDF/TXT with more content.",
    );
  }
  if (resumeText.length > 35_000) {
    throw new HttpError(400, "BAD_REQUEST", "CV text is too long. Please trim to under 35,000 characters.");
  }

  const jobContext = await resolveJobContext(
    input.jobId,
    input.jobDescription,
    "\n\nAdditional notes from applicant:\n",
  );

  if (jobContext.length < 60) {
    throw new HttpError(
      400,
      "BAD_REQUEST",
      "Select a job from the list or paste a job description (at least ~60 characters).",
    );
  }
  if (jobContext.length > 20_000) {
    throw new HttpError(400, "BAD_REQUEST", "Job context is too long. Please shorten pasted text.");
  }

  try {
    const data = await analyzeResumeAgainstJob({ resumeText, jobContext });
    return { data, resumeTextUsed: resumeText.slice(0, 28_000) };
  } catch (e) {
    return rethrowAsHttpError(
      e,
      "Resume-fit AI is not configured. Add GROQ_API_KEY (free tier at console.groq.com) or OPENAI_API_KEY, and see OPENAI_BASE_URL in .env.example.",
    );
  }
}

export type RewriteResumeFitInput = {
  jobId: string;
  jobDescription: string;
  resumeText: string;
};

export async function rewriteResumeFit(input: RewriteResumeFitInput) {
  if (input.resumeText.length < 80) {
    throw new HttpError(400, "BAD_REQUEST", "resumeText must be at least ~80 characters.");
  }

  const jobContext = await resolveJobContext(input.jobId, input.jobDescription, "\n\n");

  if (jobContext.length < 60) {
    throw new HttpError(
      400,
      "BAD_REQUEST",
      "Provide jobId or a jobDescription of at least ~60 characters.",
    );
  }

  try {
    return await rewriteResumeForJob({ resumeText: input.resumeText, jobContext });
  } catch (e) {
    return rethrowAsHttpError(
      e,
      "Resume-fit AI is not configured. Add GROQ_API_KEY (free tier) or OPENAI_API_KEY — see .env.example.",
    );
  }
}
