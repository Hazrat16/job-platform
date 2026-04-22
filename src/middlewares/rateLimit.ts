import { NextFunction, Request, Response } from "express";
import { fail } from "../utils/http.js";

type Bucket = { hits: number; resetAt: number };

const buckets = new Map<string, Bucket>();

type RateLimitOptions = {
  key: string;
  windowMs: number;
  max: number;
};

export function rateLimit({ key, windowMs, max }: RateLimitOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const mapKey = `${key}:${ip}`;
    const current = buckets.get(mapKey);

    if (!current || now > current.resetAt) {
      buckets.set(mapKey, { hits: 1, resetAt: now + windowMs });
      next();
      return;
    }

    current.hits += 1;
    if (current.hits > max) {
      const retrySeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
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
