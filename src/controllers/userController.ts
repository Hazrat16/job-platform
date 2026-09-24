import { Request, Response } from "express";
import * as profileService from "../services/profileService.js";
import { ok } from "../utils/http.js";

export const uploadProfilePhoto = async (req: Request, res: Response) => {
  const userId = (req as any).user.id || (req as any).user._id || (req as any).user.userId;
  const data = await profileService.uploadProfilePhoto(userId, req.file?.path);
  return ok(res, data, "Profile photo updated successfully");
};
