import { Request, Response } from "express";
import mongoose from "mongoose";
import Job from "../models/jobModel.js";
import { analyzeResumeAgainstJob, rewriteResumeForJob } from "../services/resumeFitAIService.js";
import { extractResumeTextFromUpload } from "../utils/resumeTextExtract.js";

type JwtUser = { id: string; role: string };

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

export const analyzeResumeFit = async (req: Request, res: Response) => {
  try {
    const jwtUser = (req as Request & { user: JwtUser }).user;
    if (!jwtUser) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const body = req.body as Record<string, string | undefined>;
    const jobId = (body["jobId"] || "").trim();
    const jobDescriptionExtra = (body["jobDescription"] || "").trim();
    let resumeText = (body["resumeText"] || "").trim();

    const file = req.file as Express.Multer.File | undefined;
    if (file?.buffer) {
      const extracted = await extractResumeTextFromUpload(
        file.buffer,
        file.mimetype,
        file.originalname,
      );
      if (!extracted.ok) {
        return res.status(400).json({ success: false, message: extracted.message });
      }
      resumeText = extracted.text;
    }

    if (resumeText.length < 80) {
      return res.status(400).json({
        success: false,
        message: "CV text is too short. Paste at least ~80 characters or upload a PDF/TXT with more content.",
      });
    }
    if (resumeText.length > 35_000) {
      return res.status(400).json({
        success: false,
        message: "CV text is too long. Please trim to under 35,000 characters.",
      });
    }

    let jobContext = jobDescriptionExtra;
    if (jobId) {
      if (!mongoose.Types.ObjectId.isValid(jobId)) {
        return res.status(400).json({ success: false, message: "Invalid job id" });
      }
      const job = await Job.findById(jobId).lean();
      if (!job) {
        return res.status(404).json({ success: false, message: "Job not found" });
      }
      const base = buildJobContext(job);
      jobContext = jobDescriptionExtra
        ? `${base}\n\nAdditional notes from applicant:\n${jobDescriptionExtra}`
        : base;
    }

    if (jobContext.length < 60) {
      return res.status(400).json({
        success: false,
        message: "Select a job from the list or paste a job description (at least ~60 characters).",
      });
    }
    if (jobContext.length > 20_000) {
      return res.status(400).json({
        success: false,
        message: "Job context is too long. Please shorten pasted text.",
      });
    }

    const data = await analyzeResumeAgainstJob({ resumeText, jobContext });
    return res.json({
      success: true,
      message: "Analysis complete",
      data,
      meta: {
        resumeTextUsed: resumeText.slice(0, 28_000),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Analysis failed";
    if (msg.includes("Resume-fit AI is not configured")) {
      return res.status(503).json({
        success: false,
        message:
          "Resume-fit AI is not configured. Add GROQ_API_KEY (free tier at console.groq.com) or OPENAI_API_KEY, and see OPENAI_BASE_URL in .env.example.",
      });
    }
    console.error("analyzeResumeFit", e);
    return res.status(502).json({ success: false, message: msg });
  }
};

export const rewriteResumeFit = async (req: Request, res: Response) => {
  try {
    const jwtUser = (req as Request & { user: JwtUser }).user;
    if (!jwtUser) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { resumeText: rawResume, jobDescription: rawJob, jobId } = req.body as {
      resumeText?: string;
      jobDescription?: string;
      jobId?: string;
    };

    let resumeText = (rawResume || "").trim();
    const jobDescriptionExtra = (rawJob || "").trim();
    const jid = (jobId || "").trim();

    if (resumeText.length < 80) {
      return res.status(400).json({
        success: false,
        message: "resumeText must be at least ~80 characters.",
      });
    }

    let jobContext = jobDescriptionExtra;
    if (jid) {
      if (!mongoose.Types.ObjectId.isValid(jid)) {
        return res.status(400).json({ success: false, message: "Invalid job id" });
      }
      const job = await Job.findById(jid).lean();
      if (!job) {
        return res.status(404).json({ success: false, message: "Job not found" });
      }
      const base = buildJobContext(job);
      jobContext = jobDescriptionExtra ? `${base}\n\n${jobDescriptionExtra}` : base;
    }

    if (jobContext.length < 60) {
      return res.status(400).json({
        success: false,
        message: "Provide jobId or a jobDescription of at least ~60 characters.",
      });
    }

    const data = await rewriteResumeForJob({ resumeText, jobContext });
    return res.json({
      success: true,
      message: "Rewrite complete",
      data,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Rewrite failed";
    if (msg.includes("Resume-fit AI is not configured")) {
      return res.status(503).json({
        success: false,
        message:
          "Resume-fit AI is not configured. Add GROQ_API_KEY (free tier) or OPENAI_API_KEY — see .env.example.",
      });
    }
    console.error("rewriteResumeFit", e);
    return res.status(502).json({ success: false, message: msg });
  }
};
