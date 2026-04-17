import mongoose from "mongoose";
import { Request, Response } from "express";
import Application from "../models/applicationModel.js";
import Job from "../models/jobModel.js";

const JOB_SORT_MAP: Record<string, Record<string, 1 | -1>> = {
  recent: { createdAt: -1 },
  oldest: { createdAt: 1 },
  salary_desc: { "salary.max": -1, createdAt: -1 },
  salary_asc: { "salary.min": 1, createdAt: -1 },
};

export const getJobs = async (req: Request, res: Response) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json({
        success: true,
        message: "Database unavailable, returning empty jobs list",
        data: [],
        meta: { page: 1, limit: 0, total: 0, totalPages: 0 },
      });
    }

    const {
      page = "1",
      limit = "10",
      search,
      location,
      type,
      status = "active",
      minSalary,
      maxSalary,
      sort = "recent",
    } = req.query as Record<string, string>;

    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const limitNumber = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
    const skip = (pageNumber - 1) * limitNumber;

    const filter: Record<string, unknown> = {};

    if (status) filter["status"] = status;
    if (type) filter["type"] = type;
    if (location) filter["location"] = { $regex: location, $options: "i" };
    if (search) filter["$text"] = { $search: search };

    if (minSalary || maxSalary) {
      filter["salary.min"] = {};
      if (minSalary) {
        (filter["salary.min"] as Record<string, number>)["$gte"] =
          parseInt(minSalary, 10) || 0;
      }
      if (maxSalary) {
        (filter["salary.min"] as Record<string, number>)["$lte"] =
          parseInt(maxSalary, 10) || Number.MAX_SAFE_INTEGER;
      }
    }

    const sortConfig = JOB_SORT_MAP[sort] || JOB_SORT_MAP["recent"];

    const [jobs, total] = await Promise.all([
      Job.find(filter)
        .populate("employer", "name email role isVerified photo")
        .sort(sortConfig)
        .skip(skip)
        .limit(limitNumber),
      Job.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      message: "Jobs fetched successfully",
      data: jobs,
      meta: {
        page: pageNumber,
        limit: limitNumber,
        total,
        totalPages: Math.ceil(total / limitNumber),
      },
    });
  } catch (error) {
    console.error("getJobs error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch jobs" });
  }
};

export const getMyJobs = async (req: Request, res: Response) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: "Database is currently unavailable",
      });
    }

    const user = (req as any).user as { id?: string; role?: string };
    if (user.role !== "employer") {
      return res.status(403).json({
        success: false,
        message: "Only employers can list their posted jobs",
      });
    }

    const jobs = await Job.find({ employer: user.id })
      .populate("employer", "name email role isVerified photo")
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      message: "Your jobs fetched successfully",
      data: jobs,
      meta: {
        page: 1,
        limit: jobs.length,
        total: jobs.length,
        totalPages: 1,
      },
    });
  } catch (error) {
    console.error("getMyJobs error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch your jobs" });
  }
};

export const getJobById = async (req: Request, res: Response) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res
        .status(503)
        .json({ success: false, message: "Database is currently unavailable" });
    }

    const job = await Job.findById(req.params["id"]).populate(
      "employer",
      "name email role isVerified photo"
    );

    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    return res.json({
      success: true,
      message: "Job fetched successfully",
      data: job,
    });
  } catch (error) {
    console.error("getJobById error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch job" });
  }
};

export const createJob = async (req: Request, res: Response) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res
        .status(503)
        .json({ success: false, message: "Database is currently unavailable" });
    }

    const user = (req as any).user as { id?: string; role?: string };
    if (user.role !== "employer") {
      return res
        .status(403)
        .json({ success: false, message: "Only employers can create jobs" });
    }

    const job = await Job.create({
      ...req.body,
      employer: user.id,
    });

    const populatedJob = await job.populate(
      "employer",
      "name email role isVerified photo"
    );

    return res.status(201).json({
      success: true,
      message: "Job created successfully",
      data: populatedJob,
    });
  } catch (error) {
    console.error("createJob error:", error);
    return res.status(500).json({ success: false, message: "Failed to create job" });
  }
};

export const updateJob = async (req: Request, res: Response) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res
        .status(503)
        .json({ success: false, message: "Database is currently unavailable" });
    }

    const user = (req as any).user as { id?: string; role?: string };
    const job = await Job.findById(req.params["id"]);

    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    if (user.role !== "employer" || job.employer.toString() !== user.id) {
      return res
        .status(403)
        .json({ success: false, message: "Not authorized to update this job" });
    }

    Object.assign(job, req.body);
    await job.save();

    const populatedJob = await job.populate(
      "employer",
      "name email role isVerified photo"
    );

    return res.json({
      success: true,
      message: "Job updated successfully",
      data: populatedJob,
    });
  } catch (error) {
    console.error("updateJob error:", error);
    return res.status(500).json({ success: false, message: "Failed to update job" });
  }
};

export const deleteJob = async (req: Request, res: Response) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res
        .status(503)
        .json({ success: false, message: "Database is currently unavailable" });
    }

    const user = (req as any).user as { id?: string; role?: string };
    const job = await Job.findById(req.params["id"]);

    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    if (user.role !== "employer" || job.employer.toString() !== user.id) {
      return res
        .status(403)
        .json({ success: false, message: "Not authorized to delete this job" });
    }

    await Promise.all([Job.findByIdAndDelete(job.id), Application.deleteMany({ job: job.id })]);

    return res.json({
      success: true,
      message: "Job deleted successfully",
    });
  } catch (error) {
    console.error("deleteJob error:", error);
    return res.status(500).json({ success: false, message: "Failed to delete job" });
  }
};
