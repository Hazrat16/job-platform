import { NextFunction, Request, Response } from "express";
import { logWarn } from "../utils/logger.js";

/**
 * Recursively strips keys that look like Mongo operators (`$gt`, `$where`, ...)
 * or contain a dot (path injection), mutating objects/arrays in place. Never
 * reassigns the container itself, since Express 5 makes `req.query` a getter
 * with no setter — replacing the whole object would throw.
 */
function stripDangerousKeys(value: unknown, requestId: string | undefined): boolean {
  if (Array.isArray(value)) {
    let found = false;
    for (const item of value) {
      if (stripDangerousKeys(item, requestId)) found = true;
    }
    return found;
  }

  if (value === null || typeof value !== "object") return false;

  let found = false;
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (key.startsWith("$") || key.includes(".")) {
      delete (value as Record<string, unknown>)[key];
      found = true;
      continue;
    }
    if (stripDangerousKeys((value as Record<string, unknown>)[key], requestId)) {
      found = true;
    }
  }
  return found;
}

export function sanitizeInput(req: Request, res: Response, next: NextFunction) {
  const requestId = res.locals["requestId"] as string | undefined;
  const hitBody = stripDangerousKeys(req.body, requestId);
  const hitQuery = stripDangerousKeys(req.query, requestId);
  const hitParams = stripDangerousKeys(req.params, requestId);

  if (hitBody || hitQuery || hitParams) {
    logWarn("sanitize_stripped_keys", {
      requestId,
      path: req.originalUrl,
      body: hitBody,
      query: hitQuery,
      params: hitParams,
    });
  }

  next();
}
