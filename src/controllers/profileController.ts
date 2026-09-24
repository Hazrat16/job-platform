import { Request, Response } from "express";
import * as profileService from "../services/profileService.js";
import { ok } from "../utils/http.js";

export const getMyProfile = async (req: Request, res: Response) => {
  const userId = (req as any).user?.id as string | undefined;
  const data = await profileService.getMyProfile(userId);
  return ok(res, data, "Profile loaded");
};

export const updateMyProfile = async (req: Request, res: Response) => {
  const userId = (req as any).user?.id as string | undefined;
  const { name, profile } = req.body as { name?: string; profile?: Record<string, unknown> };
  const data = await profileService.updateMyProfile(userId, { name, profile });
  return ok(res, data, "Profile updated");
};

export const uploadProfileResume = async (req: Request, res: Response) => {
  const userId = (req as any).user?.id as string | undefined;
  const file = req.file as Express.Multer.File | undefined;
  const data = await profileService.uploadProfileResume(userId, file?.path);
  return ok(res, data, "Resume uploaded");
};

export const listMySessions = async (req: Request, res: Response) => {
  const userId = (req as any).user?.id as string | undefined;
  const currentSid = (req as any).user?.sid as string | undefined;
  const data = await profileService.listMySessions(userId, currentSid);
  return ok(res, data, "Sessions loaded");
};

export const revokeSession = async (req: Request, res: Response) => {
  const userId = (req as any).user?.id as string | undefined;
  const currentSid = (req as any).user?.sid as string | undefined;
  const data = await profileService.revokeSession(userId, currentSid, req.params["sessionId"]);
  return ok(res, data, "Session revoked");
};

export const requestMyDataDeletion = async (req: Request, res: Response) => {
  const userId = (req as any).user?.id as string | undefined;
  const reason = typeof req.body?.reason === "string" ? String(req.body.reason).trim() : "";
  const data = await profileService.requestMyDataDeletion(userId, reason);
  return ok(res, data, "Deletion request submitted", 201);
};
