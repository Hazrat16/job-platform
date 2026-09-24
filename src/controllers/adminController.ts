import { Request, Response } from "express";
import * as adminService from "../services/adminService.js";
import { ok } from "../utils/http.js";

export const listAdminUsers = async (_req: Request, res: Response) => {
  const users = await adminService.listAdminUsers();
  return ok(res, users, "Admin users fetched successfully");
};

export const moderateUser = async (req: Request, res: Response) => {
  const admin = (req as any).user as { id?: string; role?: string };
  const { action } = req.body as { action?: adminService.UserModerationAction };
  const user = await adminService.moderateUser(admin.id, req.params["id"], action);
  return ok(res, user, "User moderation action applied");
};

export const listAdminJobs = async (_req: Request, res: Response) => {
  const jobs = await adminService.listAdminJobs();
  return ok(res, jobs, "Admin jobs fetched successfully");
};

export const moderateJob = async (req: Request, res: Response) => {
  const admin = (req as any).user as { id?: string; role?: string };
  const { action } = req.body as { action?: adminService.JobModerationAction };
  const job = await adminService.moderateJob(admin.id, req.params["id"], action);
  return ok(res, job, "Job moderation action applied");
};

export const listDeletionRequests = async (_req: Request, res: Response) => {
  const requests = await adminService.listDeletionRequests();
  return ok(res, requests, "Deletion requests fetched successfully");
};

export const reviewDeletionRequest = async (req: Request, res: Response) => {
  const admin = (req as any).user as { id?: string; role?: string };
  const { status } = req.body as { status?: adminService.DeletionRequestStatus };
  const request = await adminService.reviewDeletionRequest(admin.id, req.params["id"], status);
  return ok(res, request, "Deletion request reviewed");
};
