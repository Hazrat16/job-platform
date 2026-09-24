import { Request, Response } from "express";
import * as jobService from "../services/jobService.js";
import { ok } from "../utils/http.js";

export const getJobs = async (req: Request, res: Response) => {
  const query = req.query as jobService.JobListQuery;
  const { jobs, meta, dbUnavailable } = await jobService.listJobs(query, req.originalUrl);
  return ok(
    res,
    jobs,
    dbUnavailable ? "Database unavailable, returning empty jobs list" : "Jobs fetched successfully",
    200,
    meta,
  );
};

export const getMyJobs = async (req: Request, res: Response) => {
  const user = (req as any).user as jobService.AuthUser;
  const jobs = await jobService.listMyJobs(user);
  return ok(res, jobs, "Your jobs fetched successfully", 200, {
    page: 1,
    limit: jobs.length,
    total: jobs.length,
    totalPages: 1,
  });
};

export const getJobById = async (req: Request, res: Response) => {
  const job = await jobService.getJobById(req.params["id"]);
  return ok(res, job, "Job fetched successfully");
};

export const createJob = async (req: Request, res: Response) => {
  const user = (req as any).user as jobService.AuthUser;
  const job = await jobService.createJob(user, req.body as Record<string, unknown>);
  return ok(res, job, "Job created successfully", 201);
};

export const updateJob = async (req: Request, res: Response) => {
  const user = (req as any).user as jobService.AuthUser;
  const job = await jobService.updateJob(
    req.params["id"],
    user,
    req.body as Record<string, unknown>,
  );
  return ok(res, job, "Job updated successfully");
};

export const deleteJob = async (req: Request, res: Response) => {
  const user = (req as any).user as jobService.AuthUser;
  const result = await jobService.deleteJob(req.params["id"], user);
  return ok(res, result, "Job archived successfully");
};

export const updateJobLifecycleStatus = async (req: Request, res: Response) => {
  const user = (req as any).user as jobService.AuthUser;
  const { status } = req.body as { status: "draft" | "active" | "closed" };
  const { job, changed } = await jobService.updateJobLifecycleStatus(
    req.params["id"],
    user,
    status,
  );

  if (!changed) {
    return ok(res, job, "Job status unchanged");
  }
  const statusLabel =
    status === "active" ? "published" : status === "closed" ? "closed" : "saved as draft";
  return ok(res, job, `Job ${statusLabel} successfully`);
};
