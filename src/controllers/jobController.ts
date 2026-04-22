import mongoose from "mongoose";
import { Request, Response } from "express";
import Application from "../models/applicationModel.js";
import Job from "../models/jobModel.js";
import { fail, ok } from "../utils/http.js";

const JOB_SORT_MAP: Record<string, Record<string, 1 | -1>> = {
  recent: { createdAt: -1 },
  oldest: { createdAt: 1 },
  salary_desc: { "salary.max": -1, createdAt: -1 },
  salary_asc: { "salary.min": 1, createdAt: -1 },
};

export const getJobs = async (req: Request, res: Response) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return ok(
        res,
        [],
        "Database unavailable, returning empty jobs list",
        200,
        { page: 1, limit: 0, total: 0, totalPages: 0 },
      );
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

    const filter: Record<string, unknown> = { deletedAt: { $exists: false } };
    const normalizedStatus = status === "published" ? "active" : status;
    if (normalizedStatus) filter["status"] = normalizedStatus;
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

    return ok(res, jobs, "Jobs fetched successfully", 200, {
      page: pageNumber,
      limit: limitNumber,
      total,
      totalPages: Math.ceil(total / limitNumber),
    });
  } catch (error) {
    console.error("getJobs error:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Failed to fetch jobs");
  }
};

export const getMyJobs = async (req: Request, res: Response) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return fail(res, 503, "SERVICE_UNAVAILABLE", "Database is currently unavailable");
    }

    const user = (req as any).user as { id?: string; role?: string };

    const jobs = await Job.find({ employer: user.id, deletedAt: { $exists: false } })
      .populate("employer", "name email role isVerified photo")
      .sort({ createdAt: -1 });

    const jobIds = jobs.map((j) => j._id);
    const countRows =
      jobIds.length === 0
        ? []
        : await Application.aggregate([
            { $match: { job: { $in: jobIds } } },
            { $group: { _id: "$job", applicationCount: { $sum: 1 } } },
          ]);
    const countMap = new Map(
      countRows.map((r) => [String(r._id), r.applicationCount]),
    );
    const data = jobs.map((job) => {
      const plain = job.toObject();
      return {
        ...plain,
        applicationCount: countMap.get(String(job._id)) ?? 0,
      };
    });

    return ok(res, data, "Your jobs fetched successfully", 200, {
      page: 1,
      limit: jobs.length,
      total: jobs.length,
      totalPages: 1,
    });
  } catch (error) {
    console.error("getMyJobs error:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Failed to fetch your jobs");
  }
};

export const getJobById = async (req: Request, res: Response) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return fail(res, 503, "SERVICE_UNAVAILABLE", "Database is currently unavailable");
    }

    const job = await Job.findOne({ _id: req.params["id"], deletedAt: { $exists: false } }).populate(
      "employer",
      "name email role isVerified photo"
    );

    if (!job) {
      return fail(res, 404, "NOT_FOUND", "Job not found");
    }

    return ok(res, job, "Job fetched successfully");
  } catch (error) {
    console.error("getJobById error:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Failed to fetch job");
  }
};

export const createJob = async (req: Request, res: Response) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return fail(res, 503, "SERVICE_UNAVAILABLE", "Database is currently unavailable");
    }

    const user = (req as any).user as { id?: string; role?: string };

    const job = await Job.create({
      ...req.body,
      employer: user.id,
    });

    const populatedJob = await job.populate(
      "employer",
      "name email role isVerified photo"
    );

    return ok(res, populatedJob, "Job created successfully", 201);
  } catch (error) {
    console.error("createJob error:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Failed to create job");
  }
};

export const updateJob = async (req: Request, res: Response) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return fail(res, 503, "SERVICE_UNAVAILABLE", "Database is currently unavailable");
    }

    const user = (req as any).user as { id?: string; role?: string };
    const job = await Job.findOne({ _id: req.params["id"], deletedAt: { $exists: false } });

    if (!job) {
      return fail(res, 404, "NOT_FOUND", "Job not found");
    }

    if (user.role !== "employer" || job.employer.toString() !== user.id) {
      return fail(res, 403, "FORBIDDEN", "Not authorized to update this job");
    }

    Object.assign(job, req.body);
    await job.save();

    const populatedJob = await job.populate(
      "employer",
      "name email role isVerified photo"
    );

    return ok(res, populatedJob, "Job updated successfully");
  } catch (error) {
    console.error("updateJob error:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Failed to update job");
  }
};

export const deleteJob = async (req: Request, res: Response) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return fail(res, 503, "SERVICE_UNAVAILABLE", "Database is currently unavailable");
    }

    const user = (req as any).user as { id?: string; role?: string };
    const job = await Job.findOne({ _id: req.params["id"], deletedAt: { $exists: false } });

    if (!job) {
      return fail(res, 404, "NOT_FOUND", "Job not found");
    }

    if (user.role !== "employer" || job.employer.toString() !== user.id) {
      return fail(res, 403, "FORBIDDEN", "Not authorized to delete this job");
    }

    const update: Record<string, unknown> = {
      deletedAt: new Date(),
      status: "closed",
    };
    if (user.id) update["deletedBy"] = new mongoose.Types.ObjectId(user.id);
    await Job.updateOne({ _id: job.id }, { $set: update });
    return ok(res, { id: job.id }, "Job archived successfully");
  } catch (error) {
    console.error("deleteJob error:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Failed to delete job");
  }
};

export const updateJobLifecycleStatus = async (req: Request, res: Response) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return fail(res, 503, "SERVICE_UNAVAILABLE", "Database is currently unavailable");
    }

    const user = (req as any).user as { id?: string; role?: string };
    const job = await Job.findOne({ _id: req.params["id"], deletedAt: { $exists: false } });
    if (!job) {
      return fail(res, 404, "NOT_FOUND", "Job not found");
    }
    if (user.role !== "employer" || job.employer.toString() !== user.id) {
      return fail(res, 403, "FORBIDDEN", "Not authorized to update this job");
    }

    const { status } = req.body as { status: "draft" | "active" | "closed" };
    if (job.status === status) {
      const sameStatusJob = await job.populate(
        "employer",
        "name email role isVerified photo",
      );
      return ok(res, sameStatusJob, "Job status unchanged");
    }

    job.status = status;
    await job.save();
    const populatedJob = await job.populate(
      "employer",
      "name email role isVerified photo",
    );

    const statusLabel =
      status === "active" ? "published" : status === "closed" ? "closed" : "saved as draft";
    return ok(res, populatedJob, `Job ${statusLabel} successfully`);
  } catch (error) {
    console.error("updateJobLifecycleStatus error:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Failed to update job status");
  }
};
