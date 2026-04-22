import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Request, Response } from "express";
import mongoose from "mongoose";
import Session from "../models/sessionModel.js";
import User from "../models/userModel.js";
import {
  clearRefreshCookie,
  generateRefreshToken,
  getRequestClientInfo,
  hashToken,
  readRefreshToken,
  refreshExpiryDate,
  setRefreshCookie,
  signAccessToken,
} from "../utils/authSession.js";
import { toPublicUser } from "../utils/userPublic.js";
import { fail, ok } from "../utils/http.js";
import {
  sendResetPasswordEmail,
  sendVerificationEmail,
} from "../utils/email.js";

export const registerUser = async (req: Request, res: Response) => {
  try {
    const { name, email, password, role } = req.body;
    const file = req.file;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return fail(res, 409, "CONFLICT", "Email already exists");
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString("hex");

    let photoURL: string | undefined = undefined;
    // set uploaded photo URL
    if (file && "path" in file) {
      photoURL =
        (file as any).path || (file as any).url || (file as any).secure_url;
      console.log("Photo URL:", photoURL);
    }

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
      verificationToken,
      photo: photoURL,
    });

    // TODO: Queue email sending here
    console.log(`Verification token for ${email}: ${verificationToken}`);

    const emailSent = await sendVerificationEmail(email, verificationToken);
    if (!emailSent) {
      return fail(res, 500, "INTERNAL_ERROR", "Failed to send verification email");
    }

    return ok(
      res,
      { email },
      "User registered. Check email to verify.",
      201,
    );
  } catch (err) {
    console.error(err);
    return fail(res, 500, "INTERNAL_ERROR", "Registration failed");
  }
};

export const verifyEmail = async (req: Request, res: Response) => {
  try {
    const { token } = req.query;

    console.log("Token received:", token);

    if (!token || typeof token !== "string") {
      return fail(res, 400, "BAD_REQUEST", "Token is required");
    }

    const user = await User.findOne({ verificationToken: token });
    console.log("User found:", user);

    if (!user) return fail(res, 400, "BAD_REQUEST", "Invalid token");

    user.isVerified = true;
    user.verificationToken = undefined as any;
    await user.save();

    return ok(res, { verified: true }, "Email verified successfully!");
  } catch (err) {
    console.error(" Email verification failed:", err);
    return fail(res, 500, "INTERNAL_ERROR", "Email verification failed");
  }
};

export const loginUser = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user || !user.isVerified) {
      return fail(res, 400, "BAD_REQUEST", "Invalid credentials or email not verified");
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return fail(res, 400, "BAD_REQUEST", "Invalid credentials");

    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashToken(refreshToken);
    const expiresAt = refreshExpiryDate();
    const { userAgent, ipAddress } = getRequestClientInfo(req);

    const session = await Session.create({
      userId: user._id,
      refreshTokenHash,
      userAgent,
      ipAddress,
      lastUsedAt: new Date(),
      expiresAt,
    });

    const token = signAccessToken({
      id: String(user._id),
      role: user.role,
      sid: String(session._id),
    });
    setRefreshCookie(res, refreshToken);

    return ok(
      res,
      {
        token,
        user: toPublicUser(user),
      },
      "Login successful",
    );
  } catch (err) {
    console.error(err);
    return fail(res, 500, "INTERNAL_ERROR", "Login failed");
  }
};

export const refreshSession = async (req: Request, res: Response) => {
  try {
    const refreshToken = readRefreshToken(req);
    if (!refreshToken) {
      clearRefreshCookie(res);
      return fail(res, 401, "UNAUTHORIZED", "Refresh token is missing");
    }

    const refreshTokenHash = hashToken(refreshToken);
    const session = await Session.findOne({
      refreshTokenHash,
      revokedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    });
    if (!session) {
      clearRefreshCookie(res);
      return fail(res, 401, "UNAUTHORIZED", "Refresh token is invalid or expired");
    }

    const user = await User.findById(session.userId);
    if (!user) {
      session.revokedAt = new Date();
      await session.save();
      clearRefreshCookie(res);
      return fail(res, 401, "UNAUTHORIZED", "User not found for this session");
    }

    const nextRefreshToken = generateRefreshToken();
    session.refreshTokenHash = hashToken(nextRefreshToken);
    session.lastUsedAt = new Date();
    session.expiresAt = refreshExpiryDate();
    await session.save();

    const token = signAccessToken({
      id: String(user._id),
      role: user.role,
      sid: String(session._id),
    });
    setRefreshCookie(res, nextRefreshToken);

    return ok(res, { token, user: toPublicUser(user) }, "Session refreshed");
  } catch (error) {
    console.error("refreshSession error:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Failed to refresh session");
  }
};

export const logoutUser = async (req: Request, res: Response) => {
  try {
    const sid = (req as any).user?.sid as string | undefined;
    const refreshToken = readRefreshToken(req);

    if (sid && mongoose.Types.ObjectId.isValid(sid)) {
      await Session.updateOne(
        { _id: sid, revokedAt: { $exists: false } },
        { $set: { revokedAt: new Date() } },
      );
    } else if (refreshToken) {
      await Session.updateOne(
        {
          refreshTokenHash: hashToken(refreshToken),
          revokedAt: { $exists: false },
        },
        { $set: { revokedAt: new Date() } },
      );
    }

    clearRefreshCookie(res);
    return ok(res, { loggedOut: true }, "Logged out successfully");
  } catch (error) {
    console.error("logoutUser error:", error);
    clearRefreshCookie(res);
    return fail(res, 500, "INTERNAL_ERROR", "Failed to logout");
  }
};

export const logoutAllSessions = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as string | undefined;
    if (!userId) {
      clearRefreshCookie(res);
      return fail(res, 401, "UNAUTHORIZED", "Unauthorized");
    }

    await Session.updateMany(
      { userId, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    );
    clearRefreshCookie(res);
    return ok(res, { loggedOutAll: true }, "Logged out from all devices");
  } catch (error) {
    console.error("logoutAllSessions error:", error);
    clearRefreshCookie(res);
    return fail(res, 500, "INTERNAL_ERROR", "Failed to logout from all devices");
  }
};

export const bootstrapAdmin = async (req: Request, res: Response) => {
  try {
    const configuredSecret = process.env["ADMIN_BOOTSTRAP_SECRET"];
    if (!configuredSecret) {
      return fail(
        res,
        503,
        "SERVICE_UNAVAILABLE",
        "Admin bootstrap is not configured",
      );
    }

    const providedSecret =
      req.header("x-admin-bootstrap-secret") ||
      (typeof req.body?.secret === "string" ? req.body.secret : "");
    if (!providedSecret || providedSecret !== configuredSecret) {
      return fail(res, 403, "FORBIDDEN", "Invalid bootstrap secret");
    }

    const email =
      typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "Administrator";
    const password =
      typeof req.body?.password === "string" ? req.body.password : "";

    if (!email || !email.includes("@")) {
      return fail(res, 400, "BAD_REQUEST", "Valid admin email is required");
    }

    const existing = await User.findOne({ email });
    if (existing) {
      existing.role = "admin";
      existing.isVerified = true;
      await existing.save();
      return ok(
        res,
        { id: String(existing._id), email: existing.email, promoted: true },
        "Existing user promoted to admin",
      );
    }

    if (password.length < 6) {
      return fail(
        res,
        400,
        "BAD_REQUEST",
        "Password (min 6 chars) is required for new admin user",
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const adminUser = await User.create({
      name: name || "Administrator",
      email,
      password: hashedPassword,
      role: "admin",
      isVerified: true,
    });

    return ok(
      res,
      { id: String(adminUser._id), email: adminUser.email, created: true },
      "Admin user created",
      201,
    );
  } catch (err) {
    console.error("bootstrapAdmin error:", err);
    return fail(res, 500, "INTERNAL_ERROR", "Failed to bootstrap admin user");
  }
};

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return fail(res, 404, "NOT_FOUND", "User not found");

    const token = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = token;
    user.resetPasswordExpires = new Date(Date.now() + 3600000);
    await user.save();

    const resetLink = `http://localhost:3000/reset-password?token=${token}`;
    const emailSent = await sendResetPasswordEmail(user.email, resetLink);

    if (!emailSent) {
      return fail(res, 500, "INTERNAL_ERROR", "Failed to send reset email");
    }

    return ok(res, { email }, "Password reset link sent to your email.");
  } catch (error) {
    console.error("Forgot password error:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return fail(res, 400, "BAD_REQUEST", "Invalid or expired token");
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetPasswordToken = undefined as any;
    user.resetPasswordExpires = undefined as any;
    await user.save();
    await Session.updateMany(
      { userId: user._id, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    );
    clearRefreshCookie(res);

    return ok(res, { reset: true }, "Password reset successful");
  } catch (error) {
    console.error("Reset password error:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
};
