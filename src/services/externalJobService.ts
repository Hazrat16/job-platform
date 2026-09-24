import ExternalJobPosting from "../models/externalJobPostingModel.js";
import ExternalJobSource from "../models/externalJobSourceModel.js";
import { syncExternalSources } from "./externalJobIngestionService.js";

export async function listExternalSources() {
  return ExternalJobSource.find().sort({ phase: 1, companyName: 1 }).lean();
}

export async function syncSources(companyKey?: string) {
  return syncExternalSources(companyKey);
}

export type ExternalJobListQuery = {
  companyKey?: string | undefined;
  includeInactive?: boolean | undefined;
};

export async function listExternalJobs(query: ExternalJobListQuery) {
  const filter: Record<string, unknown> = {};
  if (query.companyKey) filter["sourceCompanyKey"] = query.companyKey;
  if (!query.includeInactive) filter["isActive"] = true;

  return ExternalJobPosting.find(filter).sort({ lastSeenAt: -1 }).limit(500).lean();
}
