import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { fail } from "../utils/http.js";
import User from "../models/userModel.js";

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

  void (async () => {
    try {
    const decoded = jwt.verify(token as string, secret) as {
      id?: string;
      role?: string;
      sid?: string;
    };
      if (!decoded.id) {
        fail(res, 401, "UNAUTHORIZED", "Invalid token");
        return;
      }
      const user = await User.findById(decoded.id).select(
        "role isSuspended suspendedAt deletedAt",
      );
      if (!user || user.deletedAt) {
        fail(res, 401, "UNAUTHORIZED", "Account unavailable");
        return;
      }
      if (user.isSuspended) {
        fail(res, 403, "FORBIDDEN", "Account suspended");
        return;
      }
      (req as any).user = { ...decoded, role: user.role };
      next();
    } catch (err) {
      fail(res, 401, "UNAUTHORIZED", "Invalid token");
      return;
    }
  })();
};
