import { NextFunction, Request, Response } from "express";
import crypto from "crypto";

export function requestContext(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header("x-request-id");
  const requestId = incoming || crypto.randomUUID();
  res.locals["requestId"] = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
}
