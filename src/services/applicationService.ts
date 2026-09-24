import mongoose from "mongoose";
import Application from "../models/applicationModel.js";
import Job from "../models/jobModel.js";
import { createNotification } from "./notificationService.js";
import { HttpError } from "../utils/http.js";
import type { AuthUser } from "./jobService.js";

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

function assertDbConnected(): void {
  if (mongoose.connection.readyState !== 1) {
    throw new HttpError(503, "SERVICE_UNAVAILABLE", "Database is currently unavailable");
  }
}

export type ApplyForJobInput = {
  jobId: string | undefined;
  user: AuthUser;
  resume: string | undefined;
  coverLetter: string | undefined;
};

export async function applyForJob({ jobId, user, resume, coverLetter }: ApplyForJobInput) {
  assertDbConnected();

  const job = await Job.findById(jobId);
  if (!job || job.status !== "active") {
    throw new HttpError(404, "NOT_FOUND", "Job not found or not active");
  }

  if (!resume) {
    throw new HttpError(400, "BAD_REQUEST", "Resume is required to apply");
  }

  const existingApplication = await Application.findOne({ job: jobId, applicant: user.id });
  if (existingApplication) {
    throw new HttpError(409, "CONFLICT", "You already applied for this job");
  }

  const application = await Application.create({
    job: jobId,
    applicant: user.id,
    resume,
    coverLetter,
    status: "pending",
    statusHistory: [
      { status: "pending", changedAt: new Date(), note: "Application submitted" },
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
  await createNotification({
    userId: String(job.employer),
    type: "application_received",
    title: "New application",
    body: `${pop.applicant?.name ?? "Someone"} applied for ${pop.job?.title ?? "a job"}.`,
    href: `/my-jobs/${jobId}/applications`,
    metadata: { jobId: String(jobId), applicationId: String(application._id) },
  });

  return populatedApplication;
}

export async function listMyApplications(user: AuthUser) {
  assertDbConnected();

  return Application.find({ applicant: user.id })
    .populate({
      path: "job",
      select: "title company location type salary status employer createdAt",
      populate: { path: "employer", select: "name email isVerified" },
    })
    .sort({ createdAt: -1 })
    .lean();
}

export async function listJobApplications(user: AuthUser, jobId: string | undefined) {
  assertDbConnected();

  const job = await Job.findById(jobId);
  if (!job) {
    throw new HttpError(404, "NOT_FOUND", "Job not found");
  }
  if (user.role !== "employer" || job.employer.toString() !== user.id) {
    throw new HttpError(403, "FORBIDDEN", "Not authorized to view applications for this job");
  }

  return Application.find({ job: jobId })
    .populate("job", "title company employer status")
    .populate("applicant", "name email role photo profile")
    .sort({ createdAt: -1 })
    .lean();
}

export type ApplicationStatus = "pending" | "reviewed" | "shortlisted" | "rejected" | "accepted";

export async function updateApplicationStatus(
  user: AuthUser,
  applicationId: string | undefined,
  nextStatus: ApplicationStatus,
) {
  assertDbConnected();

  const application = await Application.findById(applicationId).populate("job", "employer");
  if (!application) {
    throw new HttpError(404, "NOT_FOUND", "Application not found");
  }

  const jobEmployerId = ((application.job as any).employer || "").toString();
  if (user.role !== "employer" || jobEmployerId !== user.id) {
    throw new HttpError(403, "FORBIDDEN", "Not authorized to update this status");
  }

  const prevStatus = application.status;
  application.status = nextStatus;
  if (prevStatus !== nextStatus) {
    application.statusHistory.push({ status: nextStatus, changedAt: new Date() });
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
  if (applicantId) {
    await createNotification({
      userId: applicantId,
      type: "application_status",
      title: "Application status updated",
      body: `Your application for "${pop.job?.title ?? "your application"}" is now ${APPLICATION_STATUS_LABEL[nextStatus]}.`,
      href: "/applications",
      metadata: {
        applicationId: String(applicationId),
        jobId: pop.job?._id ? String(pop.job._id) : "",
        status: nextStatus,
      },
    });
  }

  return populatedApplication;
}
