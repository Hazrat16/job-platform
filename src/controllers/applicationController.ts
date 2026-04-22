import mongoose from "mongoose";
import { Request, Response } from "express";
import Application from "../models/applicationModel.js";
import Job from "../models/jobModel.js";
import { createNotification } from "../services/notificationService.js";
import { fail, ok } from "../utils/http.js";

const APPLICATION_STATUS_LABEL: Record<
  "pending" | "reviewed" | "shortlisted" | "rejected" | "accepted",
  string
> = {
  pending: "pending review",
  reviewed: "under review",
  shortlisted: "shortlisted",
  rejected: "not selected",
  accepted: "accepted",
};

export const applyForJob = async (req: Request, res: Response) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return fail(res, 503, "SERVICE_UNAVAILABLE", "Database is currently unavailable");
    }

    const user = (req as any).user as { id?: string; role?: string };
    const jobId = req.params["jobId"];

    const job = await Job.findById(jobId);
    if (!job || job.status !== "active") {
      return fail(res, 404, "NOT_FOUND", "Job not found or not active");
    }

    const file = req.file as Express.Multer.File | undefined;
    const resume = file?.path || req.body.resume;
    const coverLetter = req.body.coverLetter;

    if (!resume) {
      return fail(res, 400, "BAD_REQUEST", "Resume is required to apply");
    }

    const existingApplication = await Application.findOne({
      job: jobId,
      applicant: user.id,
    });

    if (existingApplication) {
      return fail(res, 409, "CONFLICT", "You already applied for this job");
    }

    const application = await Application.create({
      job: jobId,
      applicant: user.id,
      resume,
      coverLetter,
      status: "pending",
      statusHistory: [
        {
          status: "pending",
          changedAt: new Date(),
          note: "Application submitted",
        },
      ],
    });

    const populatedApplication = await application.populate([
      { path: "job", select: "title company location type salary status employer" },
      { path: "applicant", select: "name email role photo" },
    ]);

    const pop = populatedApplication as unknown as {
      applicant?: { name?: string };
      job?: { title?: string };
    };
    const applicantName = pop.applicant?.name ?? "Someone";
    const jobTitle = pop.job?.title ?? "a job";
    const employerId = String(job.employer);
    await createNotification({
      userId: employerId,
      type: "application_received",
      title: "New application",
      body: `${applicantName} applied for ${jobTitle}.`,
      href: `/my-jobs/${jobId}/applications`,
      metadata: {
        jobId: String(jobId),
        applicationId: String(application._id),
      },
    });

    return ok(
      res,
      populatedApplication,
      "Application submitted successfully",
      201,
    );
  } catch (error) {
    console.error("applyForJob error:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Failed to submit application");
  }
};

export const getMyApplications = async (req: Request, res: Response) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return fail(res, 503, "SERVICE_UNAVAILABLE", "Database is currently unavailable");
    }

    const user = (req as any).user as { id?: string; role?: string };

    const applications = await Application.find({ applicant: user.id })
      .populate({
        path: "job",
        select: "title company location type salary status employer createdAt",
        populate: { path: "employer", select: "name email isVerified" },
      })
      .sort({ createdAt: -1 });

    return ok(res, applications, "Applications fetched successfully");
  } catch (error) {
    console.error("getMyApplications error:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Failed to fetch applications");
  }
};

export const getJobApplications = async (req: Request, res: Response) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return fail(res, 503, "SERVICE_UNAVAILABLE", "Database is currently unavailable");
    }

    const user = (req as any).user as { id?: string; role?: string };
    const jobId = req.params["jobId"];
    const job = await Job.findById(jobId);

    if (!job) {
      return fail(res, 404, "NOT_FOUND", "Job not found");
    }

    if (user.role !== "employer" || job.employer.toString() !== user.id) {
      return fail(res, 403, "FORBIDDEN", "Not authorized to view applications for this job");
    }

    const applications = await Application.find({ job: jobId })
      .populate("job", "title company employer status")
      .populate("applicant", "name email role photo profile")
      .sort({ createdAt: -1 });

    return ok(res, applications, "Job applications fetched successfully");
  } catch (error) {
    console.error("getJobApplications error:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Failed to fetch job applications");
  }
};

export const updateApplicationStatus = async (req: Request, res: Response) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return fail(res, 503, "SERVICE_UNAVAILABLE", "Database is currently unavailable");
    }

    const user = (req as any).user as { id?: string; role?: string };
    const applicationId = req.params["applicationId"];
    const { status } = req.body as {
      status: "pending" | "reviewed" | "shortlisted" | "rejected" | "accepted";
    };

    const application = await Application.findById(applicationId).populate(
      "job",
      "employer"
    );

    if (!application) {
      return fail(res, 404, "NOT_FOUND", "Application not found");
    }

    const jobEmployerId = ((application.job as any).employer || "").toString();
    if (user.role !== "employer" || jobEmployerId !== user.id) {
      return fail(res, 403, "FORBIDDEN", "Not authorized to update this status");
    }

    const nextStatus = status as
      | "pending"
      | "reviewed"
      | "shortlisted"
      | "rejected"
      | "accepted";
    const prevStatus = application.status;
    application.status = nextStatus;
    if (prevStatus !== nextStatus) {
      application.statusHistory.push({
        status: nextStatus,
        changedAt: new Date(),
      });
    }
    await application.save();

    const populatedApplication = await application.populate([
      { path: "job", select: "title company location type salary status employer" },
      { path: "applicant", select: "name email role photo profile" },
    ]);

    const pop = populatedApplication as unknown as {
      applicant?: { _id?: mongoose.Types.ObjectId };
      job?: { _id?: mongoose.Types.ObjectId; title?: string };
    };
    const applicantId = pop.applicant?._id ? String(pop.applicant._id) : "";
    const jobTitle = pop.job?.title ?? "your application";
    const jobIdStr = pop.job?._id ? String(pop.job._id) : "";
    if (applicantId) {
      await createNotification({
        userId: applicantId,
        type: "application_status",
        title: "Application status updated",
        body: `Your application for "${jobTitle}" is now ${APPLICATION_STATUS_LABEL[nextStatus]}.`,
        href: "/applications",
        metadata: {
          applicationId,
          jobId: jobIdStr,
          status: nextStatus,
        },
      });
    }

    return ok(res, populatedApplication, "Application status updated successfully");
  } catch (error) {
    console.error("updateApplicationStatus error:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Failed to update application status");
  }
};
