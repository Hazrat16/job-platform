import mongoose from "mongoose";
import { Request, Response } from "express";
import Job from "../models/jobModel.js";
import SavedJob from "../models/savedJobModel.js";

export const listSavedJobs = async (req: Request, res: Response) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: "Database is currently unavailable",
      });
    }

    const user = (req as any).user as { id?: string; role?: string };
    if (user.role !== "jobseeker") {
      return res.status(403).json({
        success: false,
        message: "Only job seekers can view saved jobs",
      });
    }

    const saved = await SavedJob.find({ userId: user.id })
      .populate({
        path: "jobId",
        populate: {
          path: "employer",
          select: "name email role isVerified photo",
        },
      })
      .sort({ createdAt: -1 })
      .lean();

    const jobs = saved
      .map((doc) => doc.jobId)
      .filter(
        (job): job is Exclude<typeof job, null | undefined> =>
          job != null &&
          typeof job === "object" &&
          "title" in job &&
          "_id" in job
      );

    return res.json({
      success: true,
      message: "Saved jobs fetched successfully",
      data: jobs,
    });
  } catch (error) {
    console.error("listSavedJobs error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch saved jobs" });
  }
};

export const saveJob = async (req: Request, res: Response) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: "Database is currently unavailable",
      });
    }

    const user = (req as any).user as { id?: string; role?: string };
    if (user.role !== "jobseeker") {
      return res.status(403).json({
        success: false,
        message: "Only job seekers can save jobs",
      });
    }

    const jobId = req.body?.jobId as string | undefined;
    if (!jobId || !mongoose.isValidObjectId(jobId)) {
      return res.status(400).json({
        success: false,
        message: "Valid jobId is required",
      });
    }

    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
      });
    }

    const existing = await SavedJob.findOne({
      userId: user.id,
      jobId,
    });
    if (existing) {
      return res.status(200).json({
        success: true,
        message: "Job already saved",
        data: { jobId },
      });
    }

    await SavedJob.create({ userId: user.id, jobId });

    return res.status(201).json({
      success: true,
      message: "Job saved",
      data: { jobId },
    });
  } catch (error) {
    console.error("saveJob error:", error);
    return res.status(500).json({ success: false, message: "Failed to save job" });
  }
};

export const unsaveJob = async (req: Request, res: Response) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: "Database is currently unavailable",
      });
    }

    const user = (req as any).user as { id?: string; role?: string };
    if (user.role !== "jobseeker") {
      return res.status(403).json({
        success: false,
        message: "Only job seekers can unsave jobs",
      });
    }

    const jobId = req.params["jobId"];
    if (!jobId || !mongoose.isValidObjectId(jobId)) {
      return res.status(400).json({
        success: false,
        message: "Valid jobId is required",
      });
    }

    const result = await SavedJob.findOneAndDelete({
      userId: user.id,
      jobId,
    });

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Saved job not found",
      });
    }

    return res.json({
      success: true,
      message: "Job removed from saved list",
      data: { jobId },
    });
  } catch (error) {
    console.error("unsaveJob error:", error);
    return res.status(500).json({ success: false, message: "Failed to unsave job" });
  }
};
