import Redis from "ioredis";
import { logError, logInfo, logWarn, logWarnThrottled, resetLogThrottle } from "../utils/logger.js";

const RETRY_LOG_INTERVAL_MS = 60_000;

let client: Redis | null = null;
let ready = false;

/**
 * Shared Redis client for cache/rate-limit state. Returns `null` when REDIS_URL
 * isn't configured or the connection isn't currently up, so callers can fall
 * back to a per-process implementation instead of failing the request.
 *
 * Reads REDIS_URL lazily (not at module load) since ESM import hoisting can
 * evaluate this module before dotenv.config() has populated process.env.
 */
export function getRedis(): Redis | null {
  const REDIS_URL = process.env["REDIS_URL"];
  if (!REDIS_URL) return null;

  if (!client) {
    client = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 1,
      retryStrategy: (attempt) => Math.min(attempt * 500, 5000),
      lazyConnect: true,
    });
    client.on("ready", () => {
      ready = true;
      resetLogThrottle("redis_connect_retry");
      logInfo("redis_connected");
    });
    client.on("error", (err) => {
      if (ready) {
        logError("redis_error", { error: String(err) });
        return;
      }
      // Retries continue indefinitely in the background (Redis may come back later),
      // but log at most once a minute instead of on every attempt — otherwise a
      // long-unavailable Redis floods the log forever with an identical warning.
      logWarnThrottled("redis_connect_retry", RETRY_LOG_INTERVAL_MS, "redis_connect_retry", {
        error: String(err),
      });
    });
    client.on("close", () => {
      if (ready) logWarn("redis_connection_closed");
      ready = false;
    });
    client.connect().catch((err) => {
      logWarn("redis_initial_connect_failed", { error: String(err) });
    });
  }

  return ready ? client : null;
}

export function isRedisReady(): boolean {
  return ready;
}

export async function pingRedis(): Promise<boolean> {
  const redis = getRedis(); // ensures a connection attempt has been made
  if (!redis) return false;
  try {
    const reply = await redis.ping();
    return reply === "PONG";
  } catch {
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  if (!client) return;
  await client.quit().catch(() => client?.disconnect());
}
