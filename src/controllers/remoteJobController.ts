import type { Request, Response } from "express";
import { fail, ok } from "../utils/http.js";

type RemoteJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  source: "remotive" | "arbeitnow" | "remoteok";
  tags: string[];
  publishedAt?: string;
  salary?: string;
};

let remoteJobsCache: { expiresAt: number; data: RemoteJob[] } | null = null;
const REMOTE_JOBS_TTL_MS = 10 * 60 * 1000;

async function fetchRemotive(): Promise<RemoteJob[]> {
  const res = await fetch("https://remotive.com/api/remote-jobs");
  if (!res.ok) throw new Error(`Remotive API failed (${res.status})`);
  const json = (await res.json()) as {
    jobs?: Array<{
      id: number;
      title: string;
      company_name: string;
      candidate_required_location?: string;
      url: string;
      tags?: string[];
      publication_date?: string;
      salary?: string;
    }>;
  };
  return (json.jobs ?? []).map((j) => ({
    id: `remotive-${j.id}`,
    title: j.title,
    company: j.company_name,
    location: j.candidate_required_location || "Remote",
    url: j.url,
    source: "remotive",
    tags: j.tags ?? [],
    ...(j.publication_date ? { publishedAt: j.publication_date } : {}),
    ...(j.salary ? { salary: j.salary } : {}),
  }));
}

async function fetchArbeitnow(): Promise<RemoteJob[]> {
  const res = await fetch("https://www.arbeitnow.com/api/job-board-api");
  if (!res.ok) throw new Error(`Arbeitnow API failed (${res.status})`);
  const json = (await res.json()) as {
    data?: Array<{
      slug: string;
      title: string;
      company_name: string;
      location?: string;
      remote?: boolean;
      url: string;
      tags?: string[];
      created_at?: string;
    }>;
  };
  return (json.data ?? [])
    .filter((j) => j.remote !== false)
    .map((j) => ({
      id: `arbeitnow-${j.slug}`,
      title: j.title,
      company: j.company_name,
      location: j.location || "Remote",
      url: j.url,
      source: "arbeitnow",
      tags: j.tags ?? [],
      ...(j.created_at ? { publishedAt: j.created_at } : {}),
    }));
}

async function fetchRemoteOk(): Promise<RemoteJob[]> {
  const res = await fetch("https://remoteok.com/api", {
    headers: {
      Accept: "application/json",
      "User-Agent": "JobPlatformBot/1.0 (+remote-job-ingestion)",
    },
  });
  if (!res.ok) throw new Error(`RemoteOK API failed (${res.status})`);
  const json = (await res.json()) as Array<
    | { legal?: string }
    | {
        id?: number | string;
        slug?: string;
        position?: string;
        company?: string;
        location?: string;
        url?: string;
        tags?: string[];
        date?: string;
        salary_min?: number;
        salary_max?: number;
      }
  >;
  return (json ?? [])
    .filter((row): row is Exclude<(typeof json)[number], { legal?: string }> => {
      return Boolean(row && typeof row === "object" && !("legal" in row));
    })
    .map((j) => {
      const idPart = j.id ?? j.slug ?? `${j.company}-${j.position}`;
      const salaryText =
        typeof j.salary_min === "number" || typeof j.salary_max === "number"
          ? `${j.salary_min ?? "?"} - ${j.salary_max ?? "?"} USD`
          : undefined;
      return {
        id: `remoteok-${String(idPart)}`,
        title: j.position ?? "Untitled role",
        company: j.company ?? "Unknown company",
        location: j.location || "Remote",
        url: j.url || "https://remoteok.com/",
        source: "remoteok" as const,
        tags: Array.isArray(j.tags) ? j.tags : [],
        ...(j.date ? { publishedAt: j.date } : {}),
        ...(salaryText ? { salary: salaryText } : {}),
      };
    })
    .filter((job) => Boolean(job.title && job.company && job.url));
}

function dedupeJobs(items: RemoteJob[]): RemoteJob[] {
  const seen = new Set<string>();
  const out: RemoteJob[] = [];
  for (const job of items) {
    const key = `${job.title.toLowerCase()}|${job.company.toLowerCase()}|${job.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(job);
  }
  return out;
}

async function getAggregatedRemoteJobs(): Promise<RemoteJob[]> {
  const now = Date.now();
  if (remoteJobsCache && remoteJobsCache.expiresAt > now) {
    return remoteJobsCache.data;
  }
  const [r1, r2, r3] = await Promise.allSettled([
    fetchRemotive(),
    fetchArbeitnow(),
    fetchRemoteOk(),
  ]);
  const jobs = dedupeJobs([
    ...(r1.status === "fulfilled" ? r1.value : []),
    ...(r2.status === "fulfilled" ? r2.value : []),
    ...(r3.status === "fulfilled" ? r3.value : []),
  ]);
  remoteJobsCache = { expiresAt: now + REMOTE_JOBS_TTL_MS, data: jobs };
  return jobs;
}

export async function listRemoteJobs(req: Request, res: Response) {
  try {
    const query = typeof req.query["search"] === "string" ? req.query["search"].trim().toLowerCase() : "";
    const source = typeof req.query["source"] === "string" ? req.query["source"].trim() : "";
    const limit = Math.max(1, Math.min(100, Number(req.query["limit"] ?? 20) || 20));
    const page = Math.max(1, Number(req.query["page"] ?? 1) || 1);
    let jobs = await getAggregatedRemoteJobs();
    if (source) {
      jobs = jobs.filter((j) => j.source === source);
    }
    if (query) {
      jobs = jobs.filter((j) =>
        `${j.title} ${j.company} ${j.location} ${j.tags.join(" ")}`.toLowerCase().includes(query),
      );
    }
    const total = jobs.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const normalizedPage = Math.min(page, totalPages);
    const start = (normalizedPage - 1) * limit;
    const pageData = jobs.slice(start, start + limit);
    return ok(res, pageData, "Remote jobs fetched", 200, {
      total,
      page: normalizedPage,
      limit,
      totalPages,
      sources: ["remotive", "arbeitnow", "remoteok"],
      cached: true,
    });
  } catch (error) {
    return fail(res, 500, "INTERNAL_ERROR", "Failed to fetch remote jobs", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

