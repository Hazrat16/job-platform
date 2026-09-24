import type { Request, Response } from "express";
import * as remoteJobService from "../services/remoteJobService.js";
import { fail, ok } from "../utils/http.js";

export async function listRemoteJobs(req: Request, res: Response) {
  try {
    const { jobs, meta } = await remoteJobService.listRemoteJobs({
      search: typeof req.query["search"] === "string" ? req.query["search"] : undefined,
      source: typeof req.query["source"] === "string" ? req.query["source"] : undefined,
      limit: Number(req.query["limit"] ?? 20) || 20,
      page: Number(req.query["page"] ?? 1) || 1,
    });
    return ok(res, jobs, "Remote jobs fetched", 200, meta);
  } catch (error) {
    return fail(res, 500, "INTERNAL_ERROR", "Failed to fetch remote jobs", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
