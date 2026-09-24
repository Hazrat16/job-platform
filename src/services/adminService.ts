import mongoose from "mongoose";
import DataDeletionRequest from "../models/dataDeletionRequestModel.js";
import Job from "../models/jobModel.js";
import User from "../models/userModel.js";
import { HttpError } from "../utils/http.js";

function assertDbConnected(): void {
  if (mongoose.connection.readyState !== 1) {
    throw new HttpError(503, "SERVICE_UNAVAILABLE", "Database is currently unavailable");
  }
}

function assertValidObjectId(id: string | undefined, message: string): string {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw new HttpError(400, "BAD_REQUEST", message);
  }
  return id;
}

export async function listAdminUsers() {
  assertDbConnected();
  return User.find()
    .select("name email role isVerified isSuspended suspendedAt deletedAt createdAt updatedAt")
    .sort({ createdAt: -1 })
    .limit(200);
}

export type UserModerationAction = "suspend" | "unsuspend" | "soft_delete" | "promote_to_admin";

export async function moderateUser(
  adminId: string | undefined,
  userId: string | undefined,
  action: UserModerationAction | undefined,
) {
  assertDbConnected();
  const id = assertValidObjectId(userId, "Invalid user id");

  const user = await User.findById(id);
  if (!user) {
    throw new HttpError(404, "NOT_FOUND", "User not found");
  }

  if (action === "promote_to_admin") {
    if (user.role === "admin") {
      throw new HttpError(409, "CONFLICT", "User is already an admin");
    }
    await User.updateOne(
      { _id: id },
      {
        $set: { role: "admin", isSuspended: false, isVerified: true },
        $unset: { suspendedAt: 1, deletedAt: 1, deletedBy: 1 },
      },
    );
    const promoted = await User.findById(id);
    if (!promoted) throw new HttpError(404, "NOT_FOUND", "User not found");
    return promoted;
  }

  if (user.role === "admin") {
    throw new HttpError(403, "FORBIDDEN", "Admin account cannot be moderated");
  }

  if (action === "suspend") {
    user.isSuspended = true;
    user.suspendedAt = new Date();
    await user.save();
    return user;
  }

  if (action === "unsuspend") {
    await User.updateOne(
      { _id: id },
      { $set: { isSuspended: false }, $unset: { suspendedAt: 1 } },
    );
    return User.findById(id);
  }

  if (action === "soft_delete") {
    user.deletedAt = new Date();
    if (adminId) {
      user.deletedBy = new mongoose.Types.ObjectId(adminId);
    }
    user.isSuspended = true;
    user.suspendedAt = new Date();
    await user.save();
    return user;
  }

  throw new HttpError(400, "BAD_REQUEST", "Invalid moderation action");
}

export async function listAdminJobs() {
  assertDbConnected();
  return Job.find().populate("employer", "name email role").sort({ createdAt: -1 }).limit(200);
}

export type JobModerationAction = "close" | "soft_delete" | "restore";

export async function moderateJob(
  adminId: string | undefined,
  jobId: string | undefined,
  action: JobModerationAction | undefined,
) {
  assertDbConnected();
  const id = assertValidObjectId(jobId, "Invalid job id");

  const job = await Job.findById(id).populate("employer", "name email role");
  if (!job) {
    throw new HttpError(404, "NOT_FOUND", "Job not found");
  }

  if (action === "close") {
    job.status = "closed";
    await job.save();
    return job;
  }

  if (action === "soft_delete") {
    job.deletedAt = new Date();
    if (adminId) {
      job.deletedBy = new mongoose.Types.ObjectId(adminId);
    }
    job.status = "closed";
    await job.save();
    return job;
  }

  if (action === "restore") {
    await Job.updateOne(
      { _id: id },
      { $unset: { deletedAt: 1, deletedBy: 1 }, $set: { status: "active" } },
    );
    return Job.findById(id).populate("employer", "name email role");
  }

  throw new HttpError(400, "BAD_REQUEST", "Invalid moderation action");
}

export async function listDeletionRequests() {
  assertDbConnected();
  return DataDeletionRequest.find()
    .populate("userId", "name email role")
    .populate("reviewedBy", "name email")
    .sort({ createdAt: -1 })
    .limit(200);
}

export type DeletionRequestStatus = "approved" | "rejected" | "processed";
const VALID_REVIEW_STATUSES: DeletionRequestStatus[] = ["approved", "rejected", "processed"];

export async function reviewDeletionRequest(
  adminId: string | undefined,
  requestId: string | undefined,
  status: DeletionRequestStatus | undefined,
) {
  assertDbConnected();
  const id = assertValidObjectId(requestId, "Invalid request id");
  if (!status || !VALID_REVIEW_STATUSES.includes(status)) {
    throw new HttpError(400, "BAD_REQUEST", "Invalid review status");
  }

  const request = await DataDeletionRequest.findById(id);
  if (!request) {
    throw new HttpError(404, "NOT_FOUND", "Deletion request not found");
  }

  request.status = status;
  request.reviewedAt = new Date();
  if (adminId) {
    request.reviewedBy = new mongoose.Types.ObjectId(adminId);
  }
  await request.save();
  return request;
}
