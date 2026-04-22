import { NextFunction, Request, Response } from "express";
import { fail, HttpError } from "../utils/http.js";

export function notFoundHandler(req: Request, res: Response) {
  return fail(res, 404, "NOT_FOUND", `Route not found: ${req.method} ${req.originalUrl}`);
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (res.headersSent) return;

  if (err instanceof HttpError) {
    return fail(res, err.status, err.code, err.message, err.details);
  }

  console.error("Unhandled error:", {
    requestId: res.locals["requestId"],
    method: req.method,
    path: req.originalUrl,
    error: err,
  });
  return fail(res, 500, "INTERNAL_ERROR", "Something went wrong");
}
