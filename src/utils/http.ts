import { Response } from "express";

export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "TOO_MANY_REQUESTS"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

export class HttpError extends Error {
  status: number;
  code: ErrorCode;
  details?: unknown;

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function getRequestId(res: Response): string | undefined {
  return res.locals["requestId"] as string | undefined;
}

export function ok<T>(
  res: Response,
  data: T,
  message = "Request successful",
  status = 200,
  meta?: Record<string, unknown>,
) {
  return res.status(status).json({
    success: true,
    message,
    data,
    meta,
    requestId: getRequestId(res),
  });
}

export function fail(
  res: Response,
  status: number,
  code: ErrorCode,
  message: string,
  details?: unknown,
) {
  return res.status(status).json({
    success: false,
    code,
    message,
    details,
    requestId: getRequestId(res),
  });
}
