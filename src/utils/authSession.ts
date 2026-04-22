import crypto from "crypto";
import { Request, Response } from "express";
import jwt from "jsonwebtoken";

const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_DAYS = 30;
const REFRESH_COOKIE = "refreshToken";

export function signAccessToken(payload: {
  id: string;
  role: string;
  sid: string;
}): string {
  const secret = process.env["JWT_SECRET"];
  if (!secret) throw new Error("JWT_SECRET is missing");
  return jwt.sign(payload, secret, { expiresIn: ACCESS_TTL_SECONDS });
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString("base64url");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function refreshExpiryDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + REFRESH_TTL_DAYS);
  return d;
}

export function setRefreshCookie(res: Response, token: string): void {
  const isProd = process.env["NODE_ENV"] === "production";
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/api/auth",
    maxAge: REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearRefreshCookie(res: Response): void {
  const isProd = process.env["NODE_ENV"] === "production";
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/api/auth",
  });
}

export function readRefreshToken(req: Request): string | null {
  const cookieHeader = req.headers["cookie"];
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((x) => x.trim());
  for (const part of parts) {
    if (!part.startsWith(`${REFRESH_COOKIE}=`)) continue;
    return decodeURIComponent(part.slice(`${REFRESH_COOKIE}=`.length));
  }
  return null;
}

export function getRequestClientInfo(req: Request): {
  userAgent: string;
  ipAddress: string;
} {
  const userAgent = req.headers["user-agent"] || "";
  const ipAddress =
    req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() ||
    req.ip ||
    req.socket.remoteAddress ||
    "";
  return { userAgent, ipAddress };
}
