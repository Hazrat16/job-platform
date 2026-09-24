import { Queue } from "bullmq";
import IORedis from "ioredis";
import { logWarn } from "../utils/logger.js";

export type EmailJobData =
  | { kind: "verification"; to: string; token: string }
  | { kind: "reset-password"; to: string; link: string };

const QUEUE_NAME = "email";

let queue: Queue<EmailJobData> | null = null;
let connection: IORedis | null = null;

/**
 * BullMQ needs its own dedicated Redis connection (with maxRetriesPerRequest: null,
 * a hard BullMQ requirement) — separate from the general-purpose cache/rate-limit
 * client in config/redis.ts. Returns null when REDIS_URL isn't configured, so
 * callers fall back to sending synchronously instead of silently dropping email.
 */
function getQueue(): Queue<EmailJobData> | null {
  const REDIS_URL = process.env["REDIS_URL"];
  if (!REDIS_URL) return null;

  if (!queue) {
    connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
    connection.on("error", (err) => {
      logWarn("email_queue_redis_error", { error: String(err) });
    });
    queue = new Queue<EmailJobData>(QUEUE_NAME, { connection });
  }
  return queue;
}

/** Enqueues an email job; returns false (caller should send synchronously) if no queue is available. */
export async function enqueueEmail(data: EmailJobData): Promise<boolean> {
  const q = getQueue();
  if (!q) return false;

  try {
    await q.add("send", data, {
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 24 * 3600 },
    });
    return true;
  } catch (err) {
    logWarn("email_enqueue_failed", { error: String(err) });
    return false;
  }
}

export async function closeEmailQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
  if (connection) {
    await connection.quit().catch(() => connection?.disconnect());
    connection = null;
  }
}

export { QUEUE_NAME };
