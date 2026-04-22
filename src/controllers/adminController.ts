import mongoose from "mongoose";
import { Request, Response } from "express";
import DataDeletionRequest from "../models/dataDeletionRequestModel.js";
import Job from "../models/jobModel.js";
import User from "../models/userModel.js";
import { fail, ok } from "../utils/http.js";

export const listAdminUsers = async (_req: Request, res: Response) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return fail(res, 503, "SERVICE_UNAVAILABLE", "Database is currently unavailable");
    }
    const users = await User.find()
      .select(
        "name email role isVerified isSuspended suspendedAt deletedAt createdAt updatedAt",
      )
      .sort({ createdAt: -1 })
      .limit(200);
    return ok(res, users, "Admin users fetched successfully");
  } catch (error) {
    console.error("listAdminUsers error:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Failed to fetch users");
  }
};

export const moderateUser = async (req: Request, res: Response) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return fail(res, 503, "SERVICE_UNAVAILABLE", "Database is currently unavailable");
    }
    const admin = (req as any).user as { id?: string; role?: string };
    const userId = req.params["id"];
    const { action } = req.body as { action?: "suspend" | "unsuspend" | "soft_delete" };
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return fail(res, 400, "BAD_REQUEST", "Invalid user id");
    }
    const user = await User.findById(userId);
    if (!user) return fail(res, 404, "NOT_FOUND", "User not found");
    if (user.role === "admin") return fail(res, 403, "FORBIDDEN", "Admin account cannot be moderated");

    if (action === "suspend") {
      user.isSuspended = true;
      user.suspendedAt = new Date();
      await user.save();
    } else if (action === "unsuspend") {
      await User.updateOne(
        { _id: userId },
        { $set: { isSuspended: false }, $unset: { suspendedAt: 1 } },
      );
      const updated = await User.findById(userId);
      return ok(res, updated, "User moderation action applied");
    } else if (action === "soft_delete") {
      user.deletedAt = new Date();
      if (admin.id) {
        user.deletedBy = new mongoose.Types.ObjectId(admin.id);
      }
      user.isSuspended = true;
      user.suspendedAt = new Date();
      await user.save();
    } else {
      return fail(res, 400, "BAD_REQUEST", "Invalid moderation action");
    }
    return ok(res, user, "User moderation action applied");
  } catch (error) {
    console.error("moderateUser error:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Failed to moderate user");
  }
};

export const listAdminJobs = async (_req: Request, res: Response) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return fail(res, 503, "SERVICE_UNAVAILABLE", "Database is currently unavailable");
    }
    const jobs = await Job.find()
      .populate("employer", "name email role")
      .sort({ createdAt: -1 })
      .limit(200);
    return ok(res, jobs, "Admin jobs fetched successfully");
  } catch (error) {
    console.error("listAdminJobs error:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Failed to fetch jobs");
  }
};

export const moderateJob = async (req: Request, res: Response) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return fail(res, 503, "SERVICE_UNAVAILABLE", "Database is currently unavailable");
    }
    const admin = (req as any).user as { id?: string; role?: string };
    const id = req.params["id"];
    const { action } = req.body as { action?: "close" | "soft_delete" | "restore" };
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return fail(res, 400, "BAD_REQUEST", "Invalid job id");
    }
    const job = await Job.findById(id).populate("employer", "name email role");
    if (!job) return fail(res, 404, "NOT_FOUND", "Job not found");

    if (action === "close") {
      job.status = "closed";
      await job.save();
    } else if (action === "soft_delete") {
      job.deletedAt = new Date();
      if (admin.id) {
        job.deletedBy = new mongoose.Types.ObjectId(admin.id);
      }
      job.status = "closed";
      await job.save();
    } else if (action === "restore") {
      await Job.updateOne(
        { _id: id },
        { $unset: { deletedAt: 1, deletedBy: 1 }, $set: { status: "active" } },
      );
      const restored = await Job.findById(id).populate("employer", "name email role");
      return ok(res, restored, "Job moderation action applied");
    } else {
      return fail(res, 400, "BAD_REQUEST", "Invalid moderation action");
    }
    return ok(res, job, "Job moderation action applied");
  } catch (error) {
    console.error("moderateJob error:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Failed to moderate job");
  }
};

export const listDeletionRequests = async (_req: Request, res: Response) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return fail(res, 503, "SERVICE_UNAVAILABLE", "Database is currently unavailable");
    }
    const requests = await DataDeletionRequest.find()
      .populate("userId", "name email role")
      .populate("reviewedBy", "name email")
      .sort({ createdAt: -1 })
      .limit(200);
    return ok(res, requests, "Deletion requests fetched successfully");
  } catch (error) {
    console.error("listDeletionRequests error:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Failed to fetch deletion requests");
  }
};

export const reviewDeletionRequest = async (req: Request, res: Response) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return fail(res, 503, "SERVICE_UNAVAILABLE", "Database is currently unavailable");
    }
    const admin = (req as any).user as { id?: string; role?: string };
    const id = req.params["id"];
    const { status } = req.body as { status?: "approved" | "rejected" | "processed" };
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return fail(res, 400, "BAD_REQUEST", "Invalid request id");
    }
    if (!status || !["approved", "rejected", "processed"].includes(status)) {
      return fail(res, 400, "BAD_REQUEST", "Invalid review status");
    }
    const request = await DataDeletionRequest.findById(id);
    if (!request) return fail(res, 404, "NOT_FOUND", "Deletion request not found");
    request.status = status;
    request.reviewedAt = new Date();
    if (admin.id) {
      request.reviewedBy = new mongoose.Types.ObjectId(admin.id);
    }
    await request.save();
    return ok(res, request, "Deletion request reviewed");
  } catch (error) {
    console.error("reviewDeletionRequest error:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Failed to review deletion request");
  }
};
