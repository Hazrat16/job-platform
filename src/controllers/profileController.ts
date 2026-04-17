import mongoose from "mongoose";
import { Request, Response } from "express";
import User, { IUserProfile } from "../models/userModel.js";
import { toPublicUser } from "../utils/userPublic.js";

function mergeProfile(
  existing: IUserProfile | undefined,
  incoming: Record<string, unknown>,
): IUserProfile {
  const e = existing;
  const rawSkills = incoming["skills"];
  let skills: string[] = e?.skills ?? [];
  if (Array.isArray(rawSkills) && rawSkills.every((x) => typeof x === "string")) {
    skills = (rawSkills as string[]).map((s) => s.trim()).filter(Boolean);
  } else if (typeof rawSkills === "string") {
    skills = rawSkills
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const str = (key: string, fallback: string) =>
    typeof incoming[key] === "string" ? (incoming[key] as string).trim() : fallback;

  return {
    headline: str("headline", e?.headline ?? ""),
    bio: str("bio", e?.bio ?? ""),
    phone: str("phone", e?.phone ?? ""),
    location: str("location", e?.location ?? ""),
    skills,
    linkedIn: str("linkedIn", e?.linkedIn ?? ""),
    github: str("github", e?.github ?? ""),
    portfolio: str("portfolio", e?.portfolio ?? ""),
    resumeUrl: e?.resumeUrl ?? "",
  };
}

export const getMyProfile = async (req: Request, res: Response) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: "Database is currently unavailable",
      });
    }

    const userId = (req as any).user?.id as string | undefined;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.json({
      success: true,
      message: "Profile loaded",
      data: toPublicUser(user),
    });
  } catch (err) {
    console.error("getMyProfile:", err);
    return res.status(500).json({ success: false, message: "Failed to load profile" });
  }
};

export const updateMyProfile = async (req: Request, res: Response) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: "Database is currently unavailable",
      });
    }

    const userId = (req as any).user?.id as string | undefined;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const { name, profile } = req.body as {
      name?: string;
      profile?: Record<string, unknown>;
    };

    if (typeof name === "string" && name.trim().length >= 2) {
      user.name = name.trim();
    }

    if (profile && typeof profile === "object") {
      user.profile = mergeProfile(user.profile, profile);
    }

    await user.save();

    return res.json({
      success: true,
      message: "Profile updated",
      data: toPublicUser(user),
    });
  } catch (err) {
    console.error("updateMyProfile:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update profile" });
  }
};

export const uploadProfileResume = async (req: Request, res: Response) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: "Database is currently unavailable",
      });
    }

    const userId = (req as any).user?.id as string | undefined;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const file = req.file as Express.Multer.File | undefined;
    const url = file?.path;
    if (!url) {
      return res.status(400).json({ success: false, message: "No resume file uploaded" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const prev = user.profile ?? {
      headline: "",
      bio: "",
      phone: "",
      location: "",
      skills: [],
      linkedIn: "",
      github: "",
      portfolio: "",
      resumeUrl: "",
    };
    user.profile = { ...prev, resumeUrl: url };
    await user.save();

    return res.json({
      success: true,
      message: "Resume uploaded",
      data: { resumeUrl: url, user: toPublicUser(user) },
    });
  } catch (err) {
    console.error("uploadProfileResume:", err);
    return res.status(500).json({ success: false, message: "Failed to upload resume" });
  }
};
