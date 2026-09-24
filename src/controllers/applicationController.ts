import { Request, Response } from "express";
import * as applicationService from "../services/applicationService.js";
import type { AuthUser } from "../services/jobService.js";
import { ok } from "../utils/http.js";

export const applyForJob = async (req: Request, res: Response) => {
  const user = (req as any).user as AuthUser;
  const jobId = req.params["jobId"];
  const file = req.file as Express.Multer.File | undefined;
  const resume = file?.path || req.body.resume;
  const coverLetter = req.body.coverLetter;

  const application = await applicationService.applyForJob({ jobId, user, resume, coverLetter });
  return ok(res, application, "Application submitted successfully", 201);
};

export const getMyApplications = async (req: Request, res: Response) => {
  const user = (req as any).user as AuthUser;
  const applications = await applicationService.listMyApplications(user);
  return ok(res, applications, "Applications fetched successfully");
};

export const getJobApplications = async (req: Request, res: Response) => {
  const user = (req as any).user as AuthUser;
  const applications = await applicationService.listJobApplications(user, req.params["jobId"]);
  return ok(res, applications, "Job applications fetched successfully");
};

export const updateApplicationStatus = async (req: Request, res: Response) => {
  const user = (req as any).user as AuthUser;
  const { status } = req.body as { status: applicationService.ApplicationStatus };
  const application = await applicationService.updateApplicationStatus(
    user,
    req.params["applicationId"],
    status,
  );
  return ok(res, application, "Application status updated successfully");
};
