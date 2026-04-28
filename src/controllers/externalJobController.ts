import type { Request, Response } from "express";
import ExternalJobPosting from "../models/externalJobPostingModel.js";
import ExternalJobSource from "../models/externalJobSourceModel.js";
import { syncExternalSources } from "../services/externalJobIngestionService.js";
import { fail, ok } from "../utils/http.js";

export async function listExternalSources(_req: Request, res: Response) {
  try {
    const sources = await ExternalJobSource.find().sort({ phase: 1, companyName: 1 }).lean();
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
    const outcomes = await syncExternalSources(companyKey || undefined);
    return ok(res, outcomes, "External job sync completed");
  } catch (error) {
    return fail(res, 500, "INTERNAL_ERROR", "External job sync failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function listExternalJobs(req: Request, res: Response) {
  try {
    const companyKey =
      typeof req.query["companyKey"] === "string" ? req.query["companyKey"].trim() : "";
    const includeInactive = req.query["includeInactive"] === "true";
    const filter: Record<string, unknown> = {};
    if (companyKey) filter["sourceCompanyKey"] = companyKey;
    if (!includeInactive) filter["isActive"] = true;

    const jobs = await ExternalJobPosting.find(filter)
      .sort({ lastSeenAt: -1 })
      .limit(500)
      .lean();

    return ok(res, jobs, "External jobs fetched");
  } catch (error) {
    return fail(res, 500, "INTERNAL_ERROR", "Failed to fetch external jobs", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

