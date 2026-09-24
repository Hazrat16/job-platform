import { Worker } from "bullmq";
import IORedis from "ioredis";
import { sendResetPasswordEmail, sendVerificationEmail } from "../utils/email.js";
import { logError, logInfo, logWarn } from "../utils/logger.js";
import { QUEUE_NAME, type EmailJobData } from "./emailQueue.js";

let worker: Worker<EmailJobData> | null = null;
let connection: IORedis | null = null;

/** No-op if REDIS_URL isn't configured — jobs are then never enqueued in the first place. */
export function startEmailWorker(): void {
  const REDIS_URL = process.env["REDIS_URL"];
  if (!REDIS_URL || worker) return;

  connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  connection.on("error", (err) => {
    logWarn("email_worker_redis_error", { error: String(err) });
  });

  worker = new Worker<EmailJobData>(
    QUEUE_NAME,
    async (job) => {
      const data = job.data;
      const sent =
        data.kind === "verification"
          ? await sendVerificationEmail(data.to, data.token)
          : await sendResetPasswordEmail(data.to, data.link);
      if (!sent) {
        throw new Error(`Failed to send ${data.kind} email to ${data.to}`);
      }
    },
    { connection, concurrency: 5 },
  );

  worker.on("completed", (job) => {
    logInfo("email_job_completed", { jobId: job.id, kind: job.data.kind });
  });
  worker.on("failed", (job, err) => {
    logError("email_job_failed", {
      jobId: job?.id,
      kind: job?.data.kind,
      attemptsMade: job?.attemptsMade,
      error: String(err),
    });
  });

  logInfo("email_worker_started");
}

export async function stopEmailWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
  if (connection) {
    await connection.quit().catch(() => connection?.disconnect());
    connection = null;
  }
}
