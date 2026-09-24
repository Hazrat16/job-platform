import { Request, Response } from "express";
import * as resumeFitService from "../services/resumeFitService.js";
import { ok } from "../utils/http.js";

type JwtUser = { id: string; role: string };

export const analyzeResumeFit = async (req: Request, res: Response) => {
  const jwtUser = (req as Request & { user: JwtUser }).user;
  if (!jwtUser) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const body = req.body as Record<string, string | undefined>;
  const file = req.file as Express.Multer.File | undefined;

  const { data, resumeTextUsed } = await resumeFitService.analyzeResumeFit({
    jobId: (body["jobId"] || "").trim(),
    jobDescription: (body["jobDescription"] || "").trim(),
    resumeText: (body["resumeText"] || "").trim(),
    ...(file?.buffer
      ? { file: { buffer: file.buffer, mimetype: file.mimetype, originalname: file.originalname } }
      : {}),
  });

  return ok(res, data, "Analysis complete", 200, { resumeTextUsed });
};

export const rewriteResumeFit = async (req: Request, res: Response) => {
  const jwtUser = (req as Request & { user: JwtUser }).user;
  if (!jwtUser) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const { resumeText, jobDescription, jobId } = req.body as {
    resumeText?: string;
    jobDescription?: string;
    jobId?: string;
  };

  const data = await resumeFitService.rewriteResumeFit({
    jobId: (jobId || "").trim(),
    jobDescription: (jobDescription || "").trim(),
    resumeText: (resumeText || "").trim(),
  });

  return ok(res, data, "Rewrite complete");
};
