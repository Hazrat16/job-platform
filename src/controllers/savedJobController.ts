import { Request, Response } from "express";
import * as savedJobService from "../services/savedJobService.js";
import type { AuthUser } from "../services/jobService.js";
import { ok } from "../utils/http.js";

export const listSavedJobs = async (req: Request, res: Response) => {
  const user = (req as any).user as AuthUser;
  const jobs = await savedJobService.listSavedJobs(user);
  return ok(res, jobs, "Saved jobs fetched successfully");
};

export const saveJob = async (req: Request, res: Response) => {
  const user = (req as any).user as AuthUser;
  const { jobId, alreadySaved } = await savedJobService.saveJob(user, req.body?.jobId);
  return ok(
    res,
    { jobId },
    alreadySaved ? "Job already saved" : "Job saved",
    alreadySaved ? 200 : 201,
  );
};

export const unsaveJob = async (req: Request, res: Response) => {
  const user = (req as any).user as AuthUser;
  const result = await savedJobService.unsaveJob(user, req.params["jobId"]);
  return ok(res, result, "Job removed from saved list");
};
