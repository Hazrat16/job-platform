import bcrypt from "bcryptjs";
import crypto from "crypto";
import mongoose from "mongoose";
import Session from "../models/sessionModel.js";
import User from "../models/userModel.js";
import { enqueueEmail } from "../queues/emailQueue.js";
import {
  generateRefreshToken,
  hashToken,
  refreshExpiryDate,
  signAccessToken,
  timingSafeEqualStrings,
} from "../utils/authSession.js";
import { sendResetPasswordEmail, sendVerificationEmail } from "../utils/email.js";
import { HttpError } from "../utils/http.js";
import { logWarn } from "../utils/logger.js";
import { toPublicUser, type PublicUser } from "../utils/userPublic.js";

const BCRYPT_ROUNDS = 12;

export type RegisterInput = {
  name: string;
  email: string;
  password: string;
  role: string;
  photoURL?: string;
};

export async function registerUser(input: RegisterInput): Promise<{ email: string }> {
  const existingUser = await User.findOne({ email: input.email });
  if (existingUser) {
    throw new HttpError(409, "CONFLICT", "Email already exists");
  }

  const hashedPassword = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const verificationToken = crypto.randomBytes(32).toString("hex");

  await User.create({
    name: input.name,
    email: input.email,
    password: hashedPassword,
    role: input.role,
    verificationToken,
    photo: input.photoURL,
  });

  // The account is already created above — email delivery is best-effort from here
  // on and must never fail the registration response. A user who fails silently
  // here can still request a new verification email or reset flow later; a user
  // who gets a 500 for an account that actually exists just gets confused and
  // retries into a 409 CONFLICT.
  const queued = await enqueueEmail({
    kind: "verification",
    to: input.email,
    token: verificationToken,
  });
  if (!queued) {
    // No queue available (Redis not configured) — send synchronously instead.
    const emailSent = await sendVerificationEmail(input.email, verificationToken);
    if (!emailSent) {
      logWarn("registration_verification_email_failed", { email: input.email });
    }
  }

  return { email: input.email };
}

export async function verifyEmail(token: string | undefined): Promise<{ verified: true }> {
  if (!token) {
    throw new HttpError(400, "BAD_REQUEST", "Token is required");
  }

  const user = await User.findOne({ verificationToken: token });
  if (!user) {
    throw new HttpError(400, "BAD_REQUEST", "Invalid token");
  }

  user.isVerified = true;
  user.verificationToken = undefined as any;
  await user.save();

  return { verified: true };
}

export type ClientInfo = { userAgent: string; ipAddress: string };

export async function loginUser(
  email: string,
  password: string,
  clientInfo: ClientInfo,
): Promise<{ accessToken: string; refreshToken: string; user: PublicUser }> {
  const user = await User.findOne({ email });
  if (!user || !user.isVerified) {
    throw new HttpError(400, "BAD_REQUEST", "Invalid credentials or email not verified");
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new HttpError(400, "BAD_REQUEST", "Invalid credentials");
  }

  const refreshToken = generateRefreshToken();
  const session = await Session.create({
    userId: user._id,
    refreshTokenHash: hashToken(refreshToken),
    userAgent: clientInfo.userAgent,
    ipAddress: clientInfo.ipAddress,
    lastUsedAt: new Date(),
    expiresAt: refreshExpiryDate(),
  });

  const accessToken = signAccessToken({
    id: String(user._id),
    role: user.role,
    sid: String(session._id),
  });

  return { accessToken, refreshToken, user: toPublicUser(user) };
}

/** Throws on any failure — caller (controller) is responsible for clearing the refresh cookie either way. */
export async function refreshSession(
  refreshToken: string | null,
): Promise<{ accessToken: string; refreshToken: string; user: PublicUser }> {
  if (!refreshToken) {
    throw new HttpError(401, "UNAUTHORIZED", "Refresh token is missing");
  }

  const session = await Session.findOne({
    refreshTokenHash: hashToken(refreshToken),
    revokedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  });
  if (!session) {
    throw new HttpError(401, "UNAUTHORIZED", "Refresh token is invalid or expired");
  }

  const user = await User.findById(session.userId);
  if (!user) {
    session.revokedAt = new Date();
    await session.save();
    throw new HttpError(401, "UNAUTHORIZED", "User not found for this session");
  }

  const nextRefreshToken = generateRefreshToken();
  session.refreshTokenHash = hashToken(nextRefreshToken);
  session.lastUsedAt = new Date();
  session.expiresAt = refreshExpiryDate();
  await session.save();

  const accessToken = signAccessToken({
    id: String(user._id),
    role: user.role,
    sid: String(session._id),
  });

  return { accessToken, refreshToken: nextRefreshToken, user: toPublicUser(user) };
}

export async function logoutUser(sid: string | undefined, refreshToken: string | null): Promise<void> {
  if (sid && mongoose.Types.ObjectId.isValid(sid)) {
    await Session.updateOne(
      { _id: sid, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    );
  } else if (refreshToken) {
    await Session.updateOne(
      { refreshTokenHash: hashToken(refreshToken), revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    );
  }
}

export async function logoutAllSessions(userId: string | undefined): Promise<void> {
  if (!userId) {
    throw new HttpError(401, "UNAUTHORIZED", "Unauthorized");
  }
  await Session.updateMany(
    { userId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
  );
}

export type BootstrapAdminInput = {
  providedSecret: string;
  email: string;
  name: string;
  password: string;
};

export async function bootstrapAdmin(input: BootstrapAdminInput): Promise<{
  id: string;
  email: string;
  promoted?: boolean;
  created?: boolean;
}> {
  const configuredSecret = process.env["ADMIN_BOOTSTRAP_SECRET"];
  if (!configuredSecret) {
    throw new HttpError(503, "SERVICE_UNAVAILABLE", "Admin bootstrap is not configured");
  }
  if (!input.providedSecret || !timingSafeEqualStrings(input.providedSecret, configuredSecret)) {
    throw new HttpError(403, "FORBIDDEN", "Invalid bootstrap secret");
  }
  if (!input.email || !input.email.includes("@")) {
    throw new HttpError(400, "BAD_REQUEST", "Valid admin email is required");
  }

  const existing = await User.findOne({ email: input.email });
  if (existing) {
    existing.role = "admin";
    existing.isVerified = true;
    await existing.save();
    return { id: String(existing._id), email: existing.email, promoted: true };
  }

  if (input.password.length < 6) {
    throw new HttpError(400, "BAD_REQUEST", "Password (min 6 chars) is required for new admin user");
  }

  const hashedPassword = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const adminUser = await User.create({
    name: input.name || "Administrator",
    email: input.email,
    password: hashedPassword,
    role: "admin",
    isVerified: true,
  });

  return { id: String(adminUser._id), email: adminUser.email, created: true };
}

export async function forgotPassword(email: string): Promise<void> {
  const user = await User.findOne({ email });
  if (!user) return; // generic response either way — no user enumeration

  const token = crypto.randomBytes(32).toString("hex");
  user.resetPasswordToken = token;
  user.resetPasswordExpires = new Date(Date.now() + 3600000);
  await user.save();

  const frontendUrl = process.env["FRONTEND_URL"] || "http://localhost:3000";
  const resetLink = `${frontendUrl.replace(/\/$/, "")}/reset-password?token=${token}`;
  const queued = await enqueueEmail({ kind: "reset-password", to: user.email, link: resetLink });
  if (!queued) {
    // No queue available (Redis not configured) — send synchronously as before.
    await sendResetPasswordEmail(user.email, resetLink);
  }
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const user = await User.findOne({
    resetPasswordToken: token,
    resetPasswordExpires: { $gt: Date.now() },
  });
  if (!user) {
    throw new HttpError(400, "BAD_REQUEST", "Invalid or expired token");
  }

  user.password = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  user.resetPasswordToken = undefined as any;
  user.resetPasswordExpires = undefined as any;
  await user.save();
  await Session.updateMany(
    { userId: user._id, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
  );
}
