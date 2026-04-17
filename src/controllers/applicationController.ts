import mongoose from "mongoose";
import { Request, Response } from "express";
import Application from "../models/applicationModel.js";
import Job from "../models/jobModel.js";

export const applyForJob = async (req: Request, res: Response) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res
        .status(503)
        .json({ success: false, message: "Database is currently unavailable" });
    }

    const user = (req as any).user as { id?: string; role?: string };
    const jobId = req.params["jobId"];

    if (user.role !== "jobseeker") {
      return res
        .status(403)
        .json({ success: false, message: "Only job seekers can apply for jobs" });
    }

    const job = await Job.findById(jobId);
    if (!job || job.status !== "active") {
      return res
        .status(404)
        .json({ success: false, message: "Job not found or not active" });
    }

    const file = req.file as Express.Multer.File | undefined;
    const resume = file?.path || req.body.resume;
    const coverLetter = req.body.coverLetter;

    if (!resume) {
      return res
        .status(400)
        .json({ success: false, message: "Resume is required to apply" });
    }

    const existingApplication = await Application.findOne({
      job: jobId,
      applicant: user.id,
    });

    if (existingApplication) {
      return res
        .status(409)
        .json({ success: false, message: "You already applied for this job" });
    }

    const application = await Application.create({
      job: jobId,
      applicant: user.id,
      resume,
      coverLetter,
      status: "pending",
    });

    const populatedApplication = await application.populate([
      { path: "job", select: "title company location type salary status" },
      { path: "applicant", select: "name email role photo" },
    ]);

    return res.status(201).json({
      success: true,
      message: "Application submitted successfully",
      data: populatedApplication,
    });
  } catch (error) {
    console.error("applyForJob error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to submit application" });
  }
};

export const getMyApplications = async (req: Request, res: Response) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res
        .status(503)
        .json({ success: false, message: "Database is currently unavailable" });
    }

    const user = (req as any).user as { id?: string; role?: string };
    if (user.role !== "jobseeker") {
      return res.status(403).json({
        success: false,
        message: "Only job seekers can view their applications",
      });
    }

    const applications = await Application.find({ applicant: user.id })
      .populate({
        path: "job",
        select: "title company location type salary status employer createdAt",
        populate: { path: "employer", select: "name email isVerified" },
      })
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      message: "Applications fetched successfully",
      data: applications,
    });
  } catch (error) {
    console.error("getMyApplications error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch applications" });
  }
};

export const getJobApplications = async (req: Request, res: Response) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res
        .status(503)
        .json({ success: false, message: "Database is currently unavailable" });
    }

    const user = (req as any).user as { id?: string; role?: string };
    const jobId = req.params["jobId"];
    const job = await Job.findById(jobId);

    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    if (user.role !== "employer" || job.employer.toString() !== user.id) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view applications for this job",
      });
    }

    const applications = await Application.find({ job: jobId })
      .populate("applicant", "name email role photo")
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      message: "Job applications fetched successfully",
      data: applications,
    });
  } catch (error) {
    console.error("getJobApplications error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch job applications" });
  }
};

export const updateApplicationStatus = async (req: Request, res: Response) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res
        .status(503)
        .json({ success: false, message: "Database is currently unavailable" });
    }

    const user = (req as any).user as { id?: string; role?: string };
    const applicationId = req.params["applicationId"];
    const { status } = req.body as {
      status: "pending" | "reviewed" | "shortlisted" | "rejected" | "accepted";
    };

    const allowedStatuses = [
      "pending",
      "reviewed",
      "shortlisted",
      "rejected",
      "accepted",
    ];
    if (!allowedStatuses.includes(status)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid application status" });
    }

    const application = await Application.findById(applicationId).populate(
      "job",
      "employer"
    );

    if (!application) {
      return res
        .status(404)
        .json({ success: false, message: "Application not found" });
    }

    const jobEmployerId = ((application.job as any).employer || "").toString();
    if (user.role !== "employer" || jobEmployerId !== user.id) {
      return res
        .status(403)
        .json({ success: false, message: "Not authorized to update this status" });
    }

    application.status = status;
    await application.save();

    const populatedApplication = await application.populate([
      { path: "job", select: "title company location type salary status" },
      { path: "applicant", select: "name email role photo" },
    ]);

    return res.json({
      success: true,
      message: "Application status updated successfully",
      data: populatedApplication,
    });
  } catch (error) {
    console.error("updateApplicationStatus error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update application status" });
  }
};
