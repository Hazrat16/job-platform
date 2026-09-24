import { NextFunction, Request, Response } from "express";
import { getRedis } from "../config/redis.js";
import { logWarn } from "../utils/logger.js";
import { fail } from "../utils/http.js";

type Bucket = { hits: number; resetAt: number };

/** Per-process fallback used when Redis isn't configured/reachable. */
const memoryBuckets = new Map<string, Bucket>();
const REDIS_KEY_PREFIX = "ratelimit:";

type RateLimitOptions = {
  key: string;
  windowMs: number;
  max: number;
};

function checkMemoryBucket(
  mapKey: string,
  windowMs: number,
  max: number,
): { allowed: boolean; retrySeconds: number } {
  const now = Date.now();
  const current = memoryBuckets.get(mapKey);

  if (!current || now > current.resetAt) {
    memoryBuckets.set(mapKey, { hits: 1, resetAt: now + windowMs });
    return { allowed: true, retrySeconds: 0 };
  }

  current.hits += 1;
  if (current.hits > max) {
    return {
      allowed: false,
      retrySeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }
  return { allowed: true, retrySeconds: 0 };
}

async function checkRedisBucket(
  mapKey: string,
  windowMs: number,
  max: number,
): Promise<{ allowed: boolean; retrySeconds: number } | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const redisKey = REDIS_KEY_PREFIX + mapKey;
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.pexpire(redisKey, windowMs);
    }
    if (count > max) {
      const ttlMs = await redis.pttl(redisKey);
      return {
        allowed: false,
        retrySeconds: Math.max(1, Math.ceil((ttlMs > 0 ? ttlMs : windowMs) / 1000)),
      };
    }
    return { allowed: true, retrySeconds: 0 };
  } catch (err) {
    logWarn("ratelimit_redis_failed", { key: mapKey, error: String(err) });
    return null;
  }
}

export function rateLimit({ key, windowMs, max }: RateLimitOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const mapKey = `${key}:${ip}`;

    const redisResult = await checkRedisBucket(mapKey, windowMs, max);
    const { allowed, retrySeconds } =
      redisResult ?? checkMemoryBucket(mapKey, windowMs, max);

    if (!allowed) {
      res.setHeader("Retry-After", String(retrySeconds));
      fail(
        res,
        429,
        "TOO_MANY_REQUESTS",
        "Too many requests. Please try again shortly.",
      );
      return;
    }

    next();
  };
}
