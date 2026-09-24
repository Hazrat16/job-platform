import { Queue } from "bullmq";
import IORedis from "ioredis";
import { logWarn, logWarnThrottled } from "../utils/logger.js";

const REDIS_ERROR_LOG_INTERVAL_MS = 60_000;

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
      logWarnThrottled("email_queue_redis_error", REDIS_ERROR_LOG_INTERVAL_MS, "email_queue_redis_error", {
        error: String(err),
      });
    });
    queue = new Queue<EmailJobData>(QUEUE_NAME, { connection });
  }
  return queue;
}

const ENQUEUE_TIMEOUT_MS = 2_000;

/**
 * Enqueues an email job; returns false (caller should send synchronously) if no
 * queue is available OR Redis doesn't respond within ENQUEUE_TIMEOUT_MS.
 *
 * The timeout matters more than it looks: BullMQ requires maxRetriesPerRequest:
 * null on its connection, which means a command has no built-in give-up point —
 * if Redis is unreachable, `queue.add()` would otherwise hang until the
 * connection eventually succeeds (which, with an unbounded reconnect strategy,
 * can be indefinitely). Without this timeout, a down Redis would hang every
 * caller (e.g. registration) forever instead of falling back to sending
 * synchronously, which defeats the entire point of queueing in the first place.
 */
export async function enqueueEmail(data: EmailJobData): Promise<boolean> {
  const q = getQueue();
  if (!q) return false;

  const addPromise = q.add("send", data, {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 24 * 3600 },
  });

  let addError: unknown;
  const outcome = await Promise.race([
    addPromise.then(() => "added" as const).catch((err) => {
      addError = err;
      return "failed" as const;
    }),
    new Promise<"timeout">((resolve) => {
      setTimeout(() => resolve("timeout"), ENQUEUE_TIMEOUT_MS).unref();
    }),
  ]);

  if (outcome === "added") return true;

  if (outcome === "failed") {
    logWarn("email_enqueue_failed", { error: String(addError) });
    return false;
  }

  // Timed out — the add() call is still pending in the background and will keep
  // retrying (see the comment above). Attach a no-op catch so its eventual
  // settlement, whenever that is, never surfaces as an unhandled rejection now
  // that the caller has already moved on to the synchronous fallback.
  addPromise.catch(() => undefined);
  logWarnThrottled("email_enqueue_timeout", REDIS_ERROR_LOG_INTERVAL_MS, "email_enqueue_timeout", {});
  return false;
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
