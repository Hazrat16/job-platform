import mongoose from "mongoose";
import Application from "../models/applicationModel.js";
import Job from "../models/jobModel.js";
import { cacheDeleteByPrefix, cacheGet, cacheSet } from "../utils/apiCache.js";
import { HttpError } from "../utils/http.js";

export type AuthUser = { id?: string; role?: string };

const JOB_WRITABLE_FIELDS = [
  "title",
  "company",
  "location",
  "type",
  "salary",
  "description",
  "skills",
  "requirements",
  "benefits",
] as const;

/** Whitelist client-writable job fields — never let `status`, `employer`, `deletedAt`, etc. through. */
function pickJobWritableFields(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const field of JOB_WRITABLE_FIELDS) {
    if (body[field] !== undefined) picked[field] = body[field];
  }
  return picked;
}

function normalizeJobSkills(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of input) {
    const t = String(item).trim().slice(0, 60);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= 30) break;
  }
  return out;
}

const JOB_SORT_MAP: Record<string, Record<string, 1 | -1>> = {
  recent: { createdAt: -1 },
  oldest: { createdAt: 1 },
  salary_desc: { "salary.max": -1, createdAt: -1 },
  salary_asc: { "salary.min": 1, createdAt: -1 },
};

const JOB_LIST_CACHE_TTL_MS = 15_000;
const JOB_DETAILS_CACHE_TTL_MS = 30_000;

function assertDbConnected(): void {
  if (mongoose.connection.readyState !== 1) {
    throw new HttpError(503, "SERVICE_UNAVAILABLE", "Database is currently unavailable");
  }
}

async function loadOwnedJob(jobId: string | undefined, user: AuthUser, action: string) {
  const job = await Job.findOne({ _id: jobId, deletedAt: { $exists: false } });
  if (!job) {
    throw new HttpError(404, "NOT_FOUND", "Job not found");
  }
  if (user.role !== "employer" || job.employer.toString() !== user.id) {
    throw new HttpError(403, "FORBIDDEN", `Not authorized to ${action} this job`);
  }
  return job;
}

export type JobListQuery = {
  page?: string;
  limit?: string;
  search?: string;
  location?: string;
  type?: string;
  status?: string;
  minSalary?: string;
  maxSalary?: string;
  sort?: string;
};

export type JobListResult = {
  jobs: unknown[];
  meta: Record<string, unknown>;
  dbUnavailable?: boolean;
};

export async function listJobs(
  query: JobListQuery,
  cacheKeySuffix: string,
): Promise<JobListResult> {
  if (mongoose.connection.readyState !== 1) {
    return {
      jobs: [],
      meta: { page: 1, limit: 0, total: 0, totalPages: 0 },
      dbUnavailable: true,
    };
  }

  const {
    page = "1",
    limit = "10",
    search,
    location,
    type,
    status = "active",
    minSalary,
    maxSalary,
    sort = "recent",
  } = query;

  const pageNumber = Math.max(1, parseInt(page, 10) || 1);
  const limitNumber = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
  const skip = (pageNumber - 1) * limitNumber;

  const filter: Record<string, unknown> = { deletedAt: { $exists: false } };
  const normalizedStatus = status === "published" ? "active" : status;
  if (normalizedStatus) filter["status"] = normalizedStatus;
  if (type) filter["type"] = type;
  if (location) filter["location"] = { $regex: location, $options: "i" };
  if (search) filter["$text"] = { $search: search };

  if (minSalary || maxSalary) {
    filter["salary.min"] = {};
    if (minSalary) {
      (filter["salary.min"] as Record<string, number>)["$gte"] =
        parseInt(minSalary, 10) || 0;
    }
    if (maxSalary) {
      (filter["salary.min"] as Record<string, number>)["$lte"] =
        parseInt(maxSalary, 10) || Number.MAX_SAFE_INTEGER;
    }
  }

  const sortConfig = JOB_SORT_MAP[sort] || JOB_SORT_MAP["recent"];
  const cacheKey = `jobs:list:${cacheKeySuffix}`;
  const cached = await cacheGet<{ jobs: unknown[]; meta: Record<string, unknown> }>(cacheKey);
  if (cached) return cached;

  const [jobs, total] = await Promise.all([
    Job.find(filter)
      .populate("employer", "name role isVerified photo")
      .sort(sortConfig)
      .skip(skip)
      .limit(limitNumber)
      .lean(),
    Job.countDocuments(filter),
  ]);

  const meta = {
    page: pageNumber,
    limit: limitNumber,
    total,
    totalPages: Math.ceil(total / limitNumber),
  };
  const result = { jobs, meta };
  await cacheSet(cacheKey, result, JOB_LIST_CACHE_TTL_MS);
  return result;
}

export async function listMyJobs(user: AuthUser): Promise<Record<string, unknown>[]> {
  assertDbConnected();

  const jobs = await Job.find({ employer: user.id, deletedAt: { $exists: false } })
    .populate("employer", "name role isVerified photo")
    .sort({ createdAt: -1 })
    .lean();

  const jobIds = jobs.map((j) => j._id);
  const countRows =
    jobIds.length === 0
      ? []
      : await Application.aggregate([
          { $match: { job: { $in: jobIds } } },
          { $group: { _id: "$job", applicationCount: { $sum: 1 } } },
        ]);
  const countMap = new Map(countRows.map((r) => [String(r._id), r.applicationCount]));

  return jobs.map((job) => ({
    ...job,
    applicationCount: countMap.get(String(job._id)) ?? 0,
  }));
}

export async function getJobById(jobId: string | undefined) {
  assertDbConnected();

  const cacheKey = `jobs:details:${jobId}`;
  const cached = await cacheGet<unknown>(cacheKey);
  if (cached) return cached;

  const job = await Job.findOne({ _id: jobId, deletedAt: { $exists: false } })
    .populate("employer", "name role isVerified photo")
    .lean();

  if (!job) {
    throw new HttpError(404, "NOT_FOUND", "Job not found");
  }

  await cacheSet(cacheKey, job, JOB_DETAILS_CACHE_TTL_MS);
  return job;
}

export async function createJob(user: AuthUser, body: Record<string, unknown>) {
  assertDbConnected();

  const picked = pickJobWritableFields(body);
  const skills = normalizeJobSkills(picked["skills"]);

  const job = await Job.create({
    ...picked,
    skills,
    employer: user.id,
  });

  await cacheDeleteByPrefix("jobs:");
  return job.toObject();
}

export async function updateJob(
  jobId: string | undefined,
  user: AuthUser,
  body: Record<string, unknown>,
) {
  assertDbConnected();

  const job = await loadOwnedJob(jobId, user, "update");

  const picked = pickJobWritableFields(body);
  if (picked["skills"] !== undefined) {
    job.set("skills", normalizeJobSkills(picked["skills"]));
    delete picked["skills"];
  }
  Object.assign(job, picked);
  await job.save();

  await cacheDeleteByPrefix("jobs:");
  return job.toObject();
}

export async function deleteJob(jobId: string | undefined, user: AuthUser) {
  assertDbConnected();

  const job = await loadOwnedJob(jobId, user, "delete");

  const update: Record<string, unknown> = {
    deletedAt: new Date(),
    status: "closed",
  };
  if (user.id) update["deletedBy"] = new mongoose.Types.ObjectId(user.id);
  await Job.updateOne({ _id: job.id }, { $set: update });
  await cacheDeleteByPrefix("jobs:");

  return { id: job.id };
}

export async function updateJobLifecycleStatus(
  jobId: string | undefined,
  user: AuthUser,
  status: "draft" | "active" | "closed",
) {
  assertDbConnected();

  const job = await loadOwnedJob(jobId, user, "update");

  if (job.status === status) {
    const sameStatusJob = await job.populate("employer", "name email role isVerified photo");
    return { job: sameStatusJob, changed: false, status };
  }

  job.status = status;
  await job.save();
  const populatedJob = await job.populate("employer", "name role isVerified photo");
  await cacheDeleteByPrefix("jobs:");

  return { job: populatedJob, changed: true, status };
}
