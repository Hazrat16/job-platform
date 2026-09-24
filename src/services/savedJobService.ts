import mongoose from "mongoose";
import Job from "../models/jobModel.js";
import SavedJob from "../models/savedJobModel.js";
import { HttpError } from "../utils/http.js";
import type { AuthUser } from "./jobService.js";

function assertDbConnected(): void {
  if (mongoose.connection.readyState !== 1) {
    throw new HttpError(503, "SERVICE_UNAVAILABLE", "Database is currently unavailable");
  }
}

function assertJobseeker(user: AuthUser, action: string): void {
  if (user.role !== "jobseeker") {
    throw new HttpError(403, "FORBIDDEN", `Only job seekers can ${action}`);
  }
}

function assertValidJobId(jobId: string | undefined): string {
  if (!jobId || !mongoose.isValidObjectId(jobId)) {
    throw new HttpError(400, "BAD_REQUEST", "Valid jobId is required");
  }
  return jobId;
}

export async function listSavedJobs(user: AuthUser) {
  assertDbConnected();
  assertJobseeker(user, "view saved jobs");

  const saved = await SavedJob.find({ userId: user.id })
    .populate({
      path: "jobId",
      populate: { path: "employer", select: "name email role isVerified photo" },
    })
    .sort({ createdAt: -1 })
    .lean();

  return saved
    .map((doc) => doc.jobId)
    .filter(
      (job): job is Exclude<typeof job, null | undefined> =>
        job != null && typeof job === "object" && "title" in job && "_id" in job,
    );
}

export async function saveJob(
  user: AuthUser,
  jobIdInput: string | undefined,
): Promise<{ jobId: string; alreadySaved: boolean }> {
  assertDbConnected();
  assertJobseeker(user, "save jobs");
  const jobId = assertValidJobId(jobIdInput);

  const job = await Job.findById(jobId);
  if (!job) {
    throw new HttpError(404, "NOT_FOUND", "Job not found");
  }

  const existing = await SavedJob.findOne({ userId: user.id, jobId });
  if (existing) {
    return { jobId, alreadySaved: true };
  }

  await SavedJob.create({ userId: user.id, jobId });
  return { jobId, alreadySaved: false };
}

export async function unsaveJob(user: AuthUser, jobIdInput: string | undefined) {
  assertDbConnected();
  assertJobseeker(user, "unsave jobs");
  const jobId = assertValidJobId(jobIdInput);

  const result = await SavedJob.findOneAndDelete({ userId: user.id, jobId });
  if (!result) {
    throw new HttpError(404, "NOT_FOUND", "Saved job not found");
  }
  return { jobId };
}
