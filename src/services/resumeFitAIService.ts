/** Chat Completions base URL only (no /chat/completions suffix). */
function resolveChatApiBase(): string {
  const explicit = (
    process.env["OPENAI_BASE_URL"] ||
    process.env["OPENAI_COMPAT_BASE_URL"] ||
    ""
  ).trim();
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }
  // If only a provider key is set, use that provider’s OpenAI-compatible base (avoids sending Groq keys to OpenAI).
  if (process.env["GROQ_API_KEY"]?.trim()) {
    return "https://api.groq.com/openai/v1";
  }
  if (process.env["OPENROUTER_API_KEY"]?.trim()) {
    return "https://openrouter.ai/api/v1";
  }
  if (process.env["TOGETHER_API_KEY"]?.trim()) {
    return "https://api.together.xyz/v1";
  }
  return "https://api.openai.com/v1";
}

function resolveApiKey(): string | undefined {
  return (
    process.env["GROQ_API_KEY"] ||
    process.env["OPENROUTER_API_KEY"] ||
    process.env["TOGETHER_API_KEY"] ||
    process.env["OPENAI_API_KEY"] ||
    process.env["AI_API_KEY"]
  )?.trim() || undefined;
}

function defaultModelForBase(baseUrl: string): string {
  if (baseUrl.includes("groq.com")) return "llama-3.3-70b-versatile";
  if (baseUrl.includes("openrouter.ai")) return "meta-llama/llama-3.2-3b-instruct:free";
  if (baseUrl.includes("together.xyz")) return "meta-llama/Llama-3.3-70B-Instruct-Turbo";
  return "gpt-4o-mini";
}

/** OPENAI_MODEL must match the host; strip OpenAI-only model names when using Groq etc. */
function resolveModel(baseUrl: string): string {
  const raw = (process.env["OPENAI_MODEL"] || "").trim();
  const isGroq = baseUrl.includes("groq.com");

  if (isGroq) {
    const looksOpenAIOnly =
      !raw ||
      raw.startsWith("gpt-") ||
      raw.startsWith("o1") ||
      raw.startsWith("o3") ||
      raw.startsWith("chatgpt-");
    if (looksOpenAIOnly) {
      return defaultModelForBase(baseUrl);
    }
    return raw;
  }

  return raw || defaultModelForBase(baseUrl);
}

export type BilingualStrings = { en: string[]; bn: string[] };
export type BilingualText = { en: string; bn: string };

export type ResumeFitAnalysisResult = {
  matchPercent: number;
  atsScore: {
    overall: number;
    keywordAlignment: number;
    structureClarity: number;
    roleFitSummary: BilingualText;
  };
  missingSkills: BilingualStrings;
  suggestions: BilingualStrings;
  summary: BilingualText;
  rejectionLikelyReasons: BilingualStrings;
};

export type ResumeRewriteResult = {
  improvedCv: BilingualText;
  changeHighlights: BilingualStrings;
};

async function callOpenAIJson(system: string, userPayload: string): Promise<unknown> {
  const key = resolveApiKey();
  if (!key) {
    throw new Error(
      "Resume-fit AI is not configured: set GROQ_API_KEY (free tier) or OPENAI_API_KEY — see .env.example",
    );
  }

  const base = resolveChatApiBase();
  const url = `${base}/chat/completions`;
  const model = resolveModel(base);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
  };
  if (url.includes("openrouter.ai")) {
    headers["HTTP-Referer"] = process.env["OPENROUTER_HTTP_REFERER"] || "https://localhost";
    headers["X-Title"] = process.env["OPENROUTER_APP_NAME"] || "JobPlatform";
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      temperature: 0.25,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPayload },
      ],
    }),
  });

  const rawText = await res.text();
  if (!res.ok) {
    throw new Error(rawText.slice(0, 400) || `Chat API error ${res.status}`);
  }

  let parsed: { choices?: { message?: { content?: string } }[] };
  try {
    parsed = JSON.parse(rawText) as typeof parsed;
  } catch {
    throw new Error("Invalid response from chat API");
  }

  const content = parsed.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Empty model output");
  }

  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new Error("Model did not return valid JSON");
  }
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean);
}

function clampPct(n: unknown): number {
  const x = typeof n === "number" ? n : parseFloat(String(n));
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, Math.round(x)));
}

function coerceBilingualText(v: unknown): BilingualText {
  if (v && typeof v === "object" && "en" in (v as object) && "bn" in (v as object)) {
    const o = v as { en?: unknown; bn?: unknown };
    return { en: asString(o.en), bn: asString(o.bn) };
  }
  const s = asString(v);
  return { en: s, bn: s };
}

function coerceBilingualStrings(v: unknown): BilingualStrings {
  if (v && typeof v === "object" && "en" in (v as object) && "bn" in (v as object)) {
    const o = v as { en?: unknown; bn?: unknown };
    return { en: asStringArray(o.en), bn: asStringArray(o.bn) };
  }
  const arr = asStringArray(v);
  return { en: arr, bn: arr };
}

export function coerceAnalysis(raw: unknown): ResumeFitAnalysisResult {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const ats = o["atsScore"] && typeof o["atsScore"] === "object" ? (o["atsScore"] as Record<string, unknown>) : {};
  const roleFit = coerceBilingualText(ats["roleFitSummary"]);

  return {
    matchPercent: clampPct(o["matchPercent"]),
    atsScore: {
      overall: clampPct(ats["overall"]),
      keywordAlignment: clampPct(ats["keywordAlignment"]),
      structureClarity: clampPct(ats["structureClarity"]),
      roleFitSummary: roleFit,
    },
    missingSkills: coerceBilingualStrings(o["missingSkills"]),
    suggestions: coerceBilingualStrings(o["suggestions"]),
    summary: coerceBilingualText(o["summary"]),
    rejectionLikelyReasons: coerceBilingualStrings(o["rejectionLikelyReasons"]),
  };
}

export function coerceRewrite(raw: unknown): ResumeRewriteResult {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const improved = o["improvedCv"] && typeof o["improvedCv"] === "object"
    ? coerceBilingualText(o["improvedCv"])
    : { en: "", bn: "" };
  return {
    improvedCv: improved,
    changeHighlights: coerceBilingualStrings(o["changeHighlights"]),
  };
}

const ANALYZE_SYSTEM = `You are an expert recruiter and ATS-style analyst focused on Bangladesh's job market (local companies, multinationals, startups, and remote roles targeting BD talent).

You MUST respond with a single JSON object only (no markdown). Use this exact shape:
{
  "matchPercent": number (0-100, honest estimate of fit for THIS job),
  "atsScore": {
    "overall": number (0-100),
    "keywordAlignment": number (0-100),
    "structureClarity": number (0-100, based on headings, bullets, scanability from plain text only),
    "roleFitSummary": { "en": string, "bn": string }
  },
  "missingSkills": { "en": string[], "bn": string[] },
  "suggestions": { "en": string[], "bn": string[] },
  "summary": { "en": string, "bn": string },
  "rejectionLikelyReasons": { "en": string[], "bn": string[] }
}

Rules:
- For every string array and paired field, provide BOTH English ("en") and Bangla ("bn"). Bangla should be natural, professional বাংলা—not word-for-word literal if awkward.
- Be constructive, not cruel. "rejectionLikelyReasons" = plausible reasons a busy hiring manager might pass, phrased professionally.
- If the CV text is very short, lower scores and say what is missing.
- Do not invent employers or degrees not implied in the text.`;

const REWRITE_SYSTEM = `You are an expert CV/resume coach for Bangladesh job seekers. Rewrite the CV for clarity, impact, and alignment with the job—honestly, without fabricating employers, dates, degrees, or certifications not present in the original.

Respond with JSON only:
{
  "improvedCv": { "en": string, "bn": string },
  "changeHighlights": { "en": string[], "bn": string[] }
}

"improvedCv.en" = full improved CV body in English (plain text, sections with clear headings).
"improvedCv.bn" = full improved CV body in professional Bangla (plain text).
"changeHighlights" = bullet lists of what you changed or strengthened (same ideas in both languages).`;

export async function analyzeResumeAgainstJob(input: {
  resumeText: string;
  jobContext: string;
}): Promise<ResumeFitAnalysisResult> {
  const user = JSON.stringify({
    resumeText: input.resumeText.slice(0, 28_000),
    jobPosting: input.jobContext.slice(0, 12_000),
  });

  const raw = await callOpenAIJson(ANALYZE_SYSTEM, user);
  return coerceAnalysis(raw);
}

export async function rewriteResumeForJob(input: {
  resumeText: string;
  jobContext: string;
}): Promise<ResumeRewriteResult> {
  const user = JSON.stringify({
    resumeText: input.resumeText.slice(0, 28_000),
    jobPosting: input.jobContext.slice(0, 12_000),
  });

  const raw = await callOpenAIJson(REWRITE_SYSTEM, user);
  return coerceRewrite(raw);
}
