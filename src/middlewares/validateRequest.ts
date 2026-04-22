import { NextFunction, Request, Response } from "express";
import { fail } from "../utils/http.js";

type ValidationIssue = { field: string; message: string };

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function toIssues(req: Request, checks: Array<ValidationIssue | null>): ValidationIssue[] {
  return checks.filter((x): x is ValidationIssue => x !== null);
}

function rejectIfIssues(res: Response, issues: ValidationIssue[]) {
  if (issues.length === 0) return false;
  fail(res, 400, "BAD_REQUEST", "Validation failed", { issues });
  return true;
}

export function validateRegisterInput(req: Request, res: Response, next: NextFunction) {
  const { name, email, password, role } = req.body as Record<string, unknown>;
  const issues = toIssues(req, [
    typeof name === "string" && name.trim().length >= 2
      ? null
      : { field: "name", message: "Name must be at least 2 characters" },
    typeof email === "string" && isEmail(email)
      ? null
      : { field: "email", message: "A valid email is required" },
    typeof password === "string" && password.length >= 6
      ? null
      : { field: "password", message: "Password must be at least 6 characters" },
    role === "jobseeker" || role === "employer"
      ? null
      : { field: "role", message: "Role must be either jobseeker or employer" },
  ]);
  if (rejectIfIssues(res, issues)) return;
  next();
}

export function validateLoginInput(req: Request, res: Response, next: NextFunction) {
  const { email, password } = req.body as Record<string, unknown>;
  const issues = toIssues(req, [
    typeof email === "string" && isEmail(email)
      ? null
      : { field: "email", message: "A valid email is required" },
    typeof password === "string" && password.length > 0
      ? null
      : { field: "password", message: "Password is required" },
  ]);
  if (rejectIfIssues(res, issues)) return;
  next();
}

export function validateForgotPasswordInput(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const { email } = req.body as Record<string, unknown>;
  const issues = toIssues(req, [
    typeof email === "string" && isEmail(email)
      ? null
      : { field: "email", message: "A valid email is required" },
  ]);
  if (rejectIfIssues(res, issues)) return;
  next();
}

export function validateResetPasswordInput(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const { token, newPassword, password } = req.body as Record<string, unknown>;
  const candidatePassword =
    typeof newPassword === "string" ? newPassword : password;
  const issues = toIssues(req, [
    typeof token === "string" && token.trim().length > 0
      ? null
      : { field: "token", message: "Reset token is required" },
    typeof candidatePassword === "string" && candidatePassword.length >= 6
      ? null
      : { field: "password", message: "Password must be at least 6 characters" },
  ]);
  if (rejectIfIssues(res, issues)) return;
  if (typeof newPassword !== "string" && typeof password === "string") {
    req.body["newPassword"] = password;
  }
  next();
}

export function validateCreateJobInput(req: Request, res: Response, next: NextFunction) {
  const body = req.body as Record<string, unknown>;
  const salary = (body["salary"] ?? {}) as Record<string, unknown>;
  const issues = toIssues(req, [
    typeof body["title"] === "string" && body["title"].trim().length >= 3
      ? null
      : { field: "title", message: "Title must be at least 3 characters" },
    typeof body["company"] === "string" && body["company"].trim().length >= 2
      ? null
      : { field: "company", message: "Company is required" },
    typeof body["location"] === "string" && body["location"].trim().length >= 2
      ? null
      : { field: "location", message: "Location is required" },
    ["full-time", "part-time", "contract", "internship"].includes(
      String(body["type"] || ""),
    )
      ? null
      : { field: "type", message: "Invalid job type" },
    Number.isFinite(Number(salary["min"]))
      ? null
      : { field: "salary.min", message: "salary.min must be a number" },
    Number.isFinite(Number(salary["max"]))
      ? null
      : { field: "salary.max", message: "salary.max must be a number" },
    typeof body["description"] === "string" && body["description"].trim().length >= 20
      ? null
      : { field: "description", message: "Description must be at least 20 characters" },
  ]);
  if (rejectIfIssues(res, issues)) return;
  next();
}

export function validateUpdateJobInput(req: Request, res: Response, next: NextFunction) {
  const body = req.body as Record<string, unknown>;
  if (Object.keys(body).length === 0) {
    fail(res, 400, "BAD_REQUEST", "At least one field must be provided");
    return;
  }
  next();
}

export function validateApplicationStatusInput(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const { status } = req.body as Record<string, unknown>;
  const allowedStatuses = [
    "pending",
    "reviewed",
    "shortlisted",
    "rejected",
    "accepted",
  ];
  if (!allowedStatuses.includes(String(status))) {
    fail(res, 400, "BAD_REQUEST", "Invalid application status", {
      allowedStatuses,
    });
    return;
  }
  next();
}
