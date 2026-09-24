import { Request, Response } from "express";
import * as authService from "../services/authService.js";
import {
  clearRefreshCookie,
  getRequestClientInfo,
  readRefreshToken,
  setRefreshCookie,
} from "../utils/authSession.js";
import { ok } from "../utils/http.js";

export const registerUser = async (req: Request, res: Response) => {
  const { name, email, password, role } = req.body;
  const file = req.file as any;
  const photoURL: string | undefined =
    file && "path" in file ? file.path || file.url || file.secure_url : undefined;

  const result = await authService.registerUser({
    name,
    email,
    password,
    role,
    ...(photoURL ? { photoURL } : {}),
  });
  return ok(res, result, "User registered. Check email to verify.", 201);
};

export const verifyEmail = async (req: Request, res: Response) => {
  const { token } = req.query;
  const result = await authService.verifyEmail(typeof token === "string" ? token : undefined);
  return ok(res, result, "Email verified successfully!");
};

export const loginUser = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const clientInfo = getRequestClientInfo(req);

  const { accessToken, refreshToken, user } = await authService.loginUser(
    email,
    password,
    clientInfo,
  );
  setRefreshCookie(res, refreshToken);
  return ok(res, { token: accessToken, user }, "Login successful");
};

export const refreshSession = async (req: Request, res: Response) => {
  const refreshToken = readRefreshToken(req);
  try {
    const result = await authService.refreshSession(refreshToken);
    setRefreshCookie(res, result.refreshToken);
    return ok(res, { token: result.accessToken, user: result.user }, "Session refreshed");
  } catch (err) {
    clearRefreshCookie(res);
    throw err;
  }
};

export const logoutUser = async (req: Request, res: Response) => {
  const sid = (req as any).user?.sid as string | undefined;
  const refreshToken = readRefreshToken(req);
  try {
    await authService.logoutUser(sid, refreshToken);
    clearRefreshCookie(res);
    return ok(res, { loggedOut: true }, "Logged out successfully");
  } catch (err) {
    clearRefreshCookie(res);
    throw err;
  }
};

export const logoutAllSessions = async (req: Request, res: Response) => {
  const userId = (req as any).user?.id as string | undefined;
  try {
    await authService.logoutAllSessions(userId);
    clearRefreshCookie(res);
    return ok(res, { loggedOutAll: true }, "Logged out from all devices");
  } catch (err) {
    clearRefreshCookie(res);
    throw err;
  }
};

export const bootstrapAdmin = async (req: Request, res: Response) => {
  const providedSecret =
    req.header("x-admin-bootstrap-secret") ||
    (typeof req.body?.secret === "string" ? req.body.secret : "");
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "Administrator";
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  const result = await authService.bootstrapAdmin({ providedSecret, email, name, password });
  const message = result.promoted ? "Existing user promoted to admin" : "Admin user created";
  return ok(res, result, message, result.created ? 201 : 200);
};

export const forgotPassword = async (req: Request, res: Response) => {
  const { email } = req.body;
  await authService.forgotPassword(email);
  return ok(
    res,
    { email },
    "If an account exists for that email, a reset link has been sent.",
  );
};

export const resetPassword = async (req: Request, res: Response) => {
  const { token, newPassword } = req.body;
  await authService.resetPassword(token, newPassword);
  return ok(res, { reset: true }, "Password reset successful");
};
