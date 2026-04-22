import mongoose from "mongoose";
import Job from "../models/jobModel.js";
import NotificationJob from "../models/notificationJobModel.js";
import NotificationPreference from "../models/notificationPreferenceModel.js";
import Notification, { NotificationType } from "../models/notificationModel.js";

type CreateParams = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  href?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Best-effort enqueue: never throws to callers — failures are logged only.
 */
export async function createNotification(params: CreateParams): Promise<void> {
  try {
    if (mongoose.connection.readyState !== 1) return;
    if (!params.userId || !mongoose.isValidObjectId(params.userId)) return;

    await NotificationJob.create({
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body,
      channel: "in_app",
      status: "queued",
      href: params.href ?? "",
      metadata: params.metadata ?? {},
    });
    await NotificationJob.create({
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body,
      channel: "email",
      status: "queued",
      href: params.href ?? "",
      metadata: params.metadata ?? {},
    });
  } catch (err) {
    console.error("createNotification enqueue:", err);
  }
}

function mapTypeToPrefKey(type: NotificationType):
  | "applicationReceived"
  | "applicationStatus"
  | "jobClosingSoon" {
  if (type === "application_received") return "applicationReceived";
  if (type === "application_status") return "applicationStatus";
  return "jobClosingSoon";
}

async function shouldDeliverInApp(userId: string, type: NotificationType): Promise<boolean> {
  const pref = await NotificationPreference.findOne({ userId }).lean();
  if (!pref?.inApp) return true;
  const key = mapTypeToPrefKey(type);
  return pref.inApp[key] !== false;
}

async function shouldDeliverEmail(userId: string, type: NotificationType): Promise<boolean> {
  const pref = await NotificationPreference.findOne({ userId }).lean();
  if (!pref?.email) return true;
  const key = mapTypeToPrefKey(type);
  return pref.email[key] !== false;
}

async function processNotificationJob(jobId: string): Promise<void> {
  const now = new Date();
  const job = await NotificationJob.findOneAndUpdate(
    { _id: jobId, status: { $in: ["queued", "failed"] }, runAt: { $lte: now } },
    { status: "processing", lockedAt: now },
    { new: true },
  );
  if (!job) return;

  try {
    if (job.channel === "email") {
      if (!(await shouldDeliverEmail(String(job.userId), job.type))) {
        job.status = "done";
        job.lastError = "";
        await job.save();
        return;
      }
      // Placeholder transport for now; provider can be plugged in without changing queue logic.
      console.log(
        `[notification-email] to=${String(job.userId)} type=${job.type} title=${job.title}`,
      );
      job.status = "done";
      job.lastError = "";
      await job.save();
      return;
    }

    if (!(await shouldDeliverInApp(String(job.userId), job.type))) {
      job.status = "done";
      job.lastError = "";
      await job.save();
      return;
    }

    await Notification.create({
      userId: job.userId,
      type: job.type,
      title: job.title,
      body: job.body,
      read: false,
      href: job.href ?? "",
      metadata: job.metadata ?? {},
    });
    job.status = "done";
    job.lastError = "";
    await job.save();
  } catch (err) {
    job.attempts += 1;
    const errText = err instanceof Error ? err.message : "Unknown notification worker error";
    job.lastError = errText;
    if (job.attempts >= job.maxAttempts) {
      job.status = "dead_letter";
    } else {
      const backoffMinutes = Math.min(60, 2 ** Math.min(job.attempts, 6));
      job.status = "failed";
      job.runAt = new Date(Date.now() + backoffMinutes * 60 * 1000);
    }
    await job.save();
  }
}

let notificationWorkerBooted = false;
let notificationWorkerHandle: NodeJS.Timeout | null = null;

export function startNotificationWorker(): void {
  if (notificationWorkerBooted) return;
  notificationWorkerBooted = true;
  notificationWorkerHandle = setInterval(() => {
    void runNotificationWorkerTick();
  }, 5_000);
}

export async function runNotificationWorkerTick(): Promise<void> {
  if (mongoose.connection.readyState !== 1) return;
  const pending = await NotificationJob.find({
    status: { $in: ["queued", "failed"] },
    runAt: { $lte: new Date() },
  })
    .sort({ runAt: 1, createdAt: 1 })
    .limit(20)
    .select("_id")
    .lean();

  for (const job of pending) {
    await processNotificationJob(String(job._id));
  }
}

export async function queueJobClosingSoonNotifications(): Promise<void> {
  if (mongoose.connection.readyState !== 1) return;
  const threshold = new Date(Date.now() - 25 * 24 * 60 * 60 * 1000);
  const jobs = await Job.find({
    status: "active",
    createdAt: { $lte: threshold },
  })
    .select("_id title employer")
    .lean();

  for (const job of jobs) {
    const dedupeKey = `job-closing-soon:${String(job._id)}`;
    const exists = await NotificationJob.findOne({
      userId: job.employer,
      type: "job_closing_soon",
      "metadata.dedupeKey": dedupeKey,
    })
      .select("_id")
      .lean();
    if (exists) continue;
    await NotificationJob.create({
      userId: job.employer,
      type: "job_closing_soon",
      title: "Job has been live for a while",
      body: `"${job.title}" has been open for over 25 days. Review applicants or close the job if hiring is complete.`,
      href: `/my-jobs/${String(job._id)}/applications`,
      channel: "in_app",
      status: "queued",
      metadata: {
        jobId: String(job._id),
        dedupeKey,
      },
    });
  }
}

export function stopNotificationWorker(): void {
  if (notificationWorkerHandle) {
    clearInterval(notificationWorkerHandle);
    notificationWorkerHandle = null;
  }
  notificationWorkerBooted = false;
}
