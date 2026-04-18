import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.split(" ")[1];
  const secret = process.env["JWT_SECRET"];
  if (!secret) {
    console.error("authMiddleware: JWT_SECRET is not set");
    res.status(500).json({
      error: "Server misconfiguration",
      message: "JWT_SECRET is not defined on the API server",
    });
    return;
  }

  try {
    const decoded = jwt.verify(token as string, secret);
    (req as any).user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }
};
