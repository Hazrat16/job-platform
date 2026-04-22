import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { fail } from "../utils/http.js";

export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    fail(res, 401, "UNAUTHORIZED", "Unauthorized");
    return;
  }

  const token = authHeader.split(" ")[1];
  const secret = process.env["JWT_SECRET"];
  if (!secret) {
    console.error("authMiddleware: JWT_SECRET is not set");
    fail(
      res,
      500,
      "INTERNAL_ERROR",
      "Server misconfiguration: JWT_SECRET is not defined",
    );
    return;
  }

  try {
    const decoded = jwt.verify(token as string, secret) as {
      id?: string;
      role?: string;
    };
    (req as any).user = decoded;
    next();
  } catch (err) {
    fail(res, 401, "UNAUTHORIZED", "Invalid token");
    return;
  }
};
