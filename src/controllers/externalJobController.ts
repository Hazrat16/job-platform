import type { Request, Response } from "express";
import * as externalJobService from "../services/externalJobService.js";
import { fail, ok } from "../utils/http.js";

export async function listExternalSources(_req: Request, res: Response) {
  try {
    const sources = await externalJobService.listExternalSources();
    return ok(res, sources, "External job sources fetched");
  } catch (error) {
    return fail(res, 500, "INTERNAL_ERROR", "Failed to fetch external job sources", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function syncSources(req: Request, res: Response) {
  try {
    const companyKey =
      typeof req.body?.companyKey === "string" ? req.body.companyKey.trim() : "";
    const outcomes = await externalJobService.syncSources(companyKey || undefined);
    return ok(res, outcomes, "External job sync completed");
  } catch (error) {
    return fail(res, 500, "INTERNAL_ERROR", "External job sync failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function listExternalJobs(req: Request, res: Response) {
  try {
    const jobs = await externalJobService.listExternalJobs({
      companyKey: typeof req.query["companyKey"] === "string" ? req.query["companyKey"].trim() : undefined,
      includeInactive: req.query["includeInactive"] === "true",
    });
    return ok(res, jobs, "External jobs fetched");
  } catch (error) {
    return fail(res, 500, "INTERNAL_ERROR", "Failed to fetch external jobs", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
