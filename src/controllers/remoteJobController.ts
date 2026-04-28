import type { Request, Response } from "express";
import { fail, ok } from "../utils/http.js";

type RemoteJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  source: "remotive" | "arbeitnow";
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
  const [r1, r2] = await Promise.allSettled([fetchRemotive(), fetchArbeitnow()]);
  const jobs = dedupeJobs([
    ...(r1.status === "fulfilled" ? r1.value : []),
    ...(r2.status === "fulfilled" ? r2.value : []),
  ]);
  remoteJobsCache = { expiresAt: now + REMOTE_JOBS_TTL_MS, data: jobs };
  return jobs;
}

export async function listRemoteJobs(req: Request, res: Response) {
  try {
    const query = typeof req.query["search"] === "string" ? req.query["search"].trim().toLowerCase() : "";
    const source = typeof req.query["source"] === "string" ? req.query["source"].trim() : "";
    const limit = Math.max(1, Math.min(200, Number(req.query["limit"] ?? 100) || 100));
    let jobs = await getAggregatedRemoteJobs();
    if (source) {
      jobs = jobs.filter((j) => j.source === source);
    }
    if (query) {
      jobs = jobs.filter((j) =>
        `${j.title} ${j.company} ${j.location} ${j.tags.join(" ")}`.toLowerCase().includes(query),
      );
    }
    jobs = jobs.slice(0, limit);
    return ok(res, jobs, "Remote jobs fetched", 200, {
      total: jobs.length,
      sources: ["remotive", "arbeitnow"],
      cached: true,
    });
  } catch (error) {
    return fail(res, 500, "INTERNAL_ERROR", "Failed to fetch remote jobs", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

