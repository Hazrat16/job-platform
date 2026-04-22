import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import User from "../models/userModel.js";
import { toPublicUser } from "../utils/userPublic.js";
import { fail, ok } from "../utils/http.js";
import {
  sendResetPasswordEmail,
  sendVerificationEmail,
} from "../utils/email.js";

const JWT_SECRET = process.env["JWT_SECRET"] as string;

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
    if (!JWT_SECRET) {
      return fail(res, 500, "INTERNAL_ERROR", "Server misconfiguration");
    }

    const user = await User.findOne({ email });
    if (!user || !user.isVerified) {
      return fail(res, 400, "BAD_REQUEST", "Invalid credentials or email not verified");
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return fail(res, 400, "BAD_REQUEST", "Invalid credentials");

    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, {
      expiresIn: "7d",
    });

    return ok(res, { token, user: toPublicUser(user) }, "Login successful");
  } catch (err) {
    console.error(err);
    return fail(res, 500, "INTERNAL_ERROR", "Login failed");
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

    return ok(res, { reset: true }, "Password reset successful");
  } catch (error) {
    console.error("Reset password error:", error);
    return fail(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
};
