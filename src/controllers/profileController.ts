import mongoose from "mongoose";
import { Request, Response } from "express";
import Session from "../models/sessionModel.js";
import User, {
  IEducationItem,
  IExperienceItem,
  IUser,
  IUserProfile,
} from "../models/userModel.js";
import { toPublicUser } from "../utils/userPublic.js";

const MAX_ITEMS = 25;

function parseExperienceItems(raw: unknown): IExperienceItem[] {
  if (!Array.isArray(raw)) return [];
  const items: IExperienceItem[] = [];
  for (const row of raw.slice(0, MAX_ITEMS)) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    items.push({
      title: typeof o["title"] === "string" ? o["title"].trim() : "",
      company: typeof o["company"] === "string" ? o["company"].trim() : "",
      location: typeof o["location"] === "string" ? o["location"].trim() : "",
      startDate: typeof o["startDate"] === "string" ? o["startDate"].trim() : "",
      endDate: typeof o["endDate"] === "string" ? o["endDate"].trim() : "",
      current: o["current"] === true,
      description:
        typeof o["description"] === "string" ? o["description"].trim() : "",
    });
  }
  return items;
}

function parseEducationItems(raw: unknown): IEducationItem[] {
  if (!Array.isArray(raw)) return [];
  const items: IEducationItem[] = [];
  for (const row of raw.slice(0, MAX_ITEMS)) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    items.push({
      school: typeof o["school"] === "string" ? o["school"].trim() : "",
      degree: typeof o["degree"] === "string" ? o["degree"].trim() : "",
      field: typeof o["field"] === "string" ? o["field"].trim() : "",
      startYear: typeof o["startYear"] === "string" ? o["startYear"].trim() : "",
      endYear: typeof o["endYear"] === "string" ? o["endYear"].trim() : "",
      current: o["current"] === true,
      description:
        typeof o["description"] === "string" ? o["description"].trim() : "",
    });
  }
  return items;
}

function mergeProfile(
  existing: IUserProfile | undefined,
  incoming: Record<string, unknown>,
): IUserProfile {
  const e = existing;
  const rawSkills = incoming["skills"];
  let skills: string[] = e?.skills ?? [];
  if (incoming["skills"] !== undefined) {
    if (Array.isArray(rawSkills) && rawSkills.every((x) => typeof x === "string")) {
      skills = (rawSkills as string[]).map((s) => s.trim()).filter(Boolean);
    } else if (typeof rawSkills === "string") {
      skills = rawSkills
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      skills = [];
    }
  }

  const str = (key: string, fallback: string) =>
    typeof incoming[key] === "string" ? (incoming[key] as string).trim() : fallback;

  const experience =
    incoming["experience"] !== undefined
      ? parseExperienceItems(incoming["experience"])
      : parseExperienceItems(e?.experience ?? []);

  const education =
    incoming["education"] !== undefined
      ? parseEducationItems(incoming["education"])
      : parseEducationItems(e?.education ?? []);

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
    experience,
    education,
  };
}

export type ProfileCompletenessPayload = {
  percent: number;
  sections: {
    basics: boolean;
    summary: boolean;
    skills: boolean;
    experience: boolean;
    education: boolean;
    resume: boolean;
    links: boolean;
  };
  missingTips: string[];
};

export function computeProfileCompleteness(user: IUser): ProfileCompletenessPayload | null {
  if (user.role !== "jobseeker") return null;

  const p = user.profile ?? {};
  const skills = p.skills ?? [];
  const experience = p.experience ?? [];
  const education = p.education ?? [];

  const basics = Boolean(
    (p.phone && p.phone.trim().length > 0) &&
      (p.location && p.location.trim().length > 0),
  );
  const summary = Boolean(
    (p.headline && p.headline.trim().length >= 3) &&
      (p.bio && p.bio.trim().length >= 20),
  );
  const skillsOk = skills.length >= 1;
  const experienceOk = experience.some(
    (x) => Boolean(x.title?.trim() && x.company?.trim()),
  );
  const educationOk = education.some(
    (x) => Boolean(x.school?.trim() && x.degree?.trim()),
  );
  const resumeOk = Boolean(p.resumeUrl && p.resumeUrl.trim().length > 0);
  const linksOk = Boolean(
    (p.linkedIn && p.linkedIn.trim()) ||
      (p.github && p.github.trim()) ||
      (p.portfolio && p.portfolio.trim()),
  );

  const sections = {
    basics,
    summary,
    skills: skillsOk,
    experience: experienceOk,
    education: educationOk,
    resume: resumeOk,
    links: linksOk,
  };

  const done = Object.values(sections).filter(Boolean).length;
  const percent = Math.round((done / 7) * 100);

  const missingTips: string[] = [];
  if (!basics) missingTips.push("Add your phone and location so employers can reach you.");
  if (!summary) {
    missingTips.push(
      "Add a headline (3+ characters) and a short bio (20+ characters) describing what you do.",
    );
  }
  if (!skillsOk) missingTips.push("List at least one skill (comma-separated or as an array).");
  if (!experienceOk) {
    missingTips.push("Add at least one work experience with a job title and company.");
  }
  if (!educationOk) {
    missingTips.push("Add at least one education entry with school and degree.");
  }
  if (!resumeOk) missingTips.push("Upload a résumé from the Résumé page.");
  if (!linksOk) {
    missingTips.push("Add a LinkedIn, GitHub, or portfolio link to strengthen your profile.");
  }

  return { percent, sections, missingTips };
}

function userResponsePayload(user: IUser) {
  return {
    ...toPublicUser(user),
    profileCompleteness: computeProfileCompleteness(user),
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
      data: userResponsePayload(user),
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
      const merged = mergeProfile(user.profile, profile);
      if (user.profile?.resumeUrl) {
        merged.resumeUrl = user.profile.resumeUrl;
      }
      user.profile = merged;
    }

    await user.save();

    return res.json({
      success: true,
      message: "Profile updated",
      data: userResponsePayload(user),
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

    const merged = mergeProfile(user.profile, {});
    merged.resumeUrl = url;
    user.profile = merged;
    await user.save();

    return res.json({
      success: true,
      message: "Resume uploaded",
      data: {
        resumeUrl: url,
        user: userResponsePayload(user),
      },
    });
  } catch (err) {
    console.error("uploadProfileResume:", err);
    return res.status(500).json({ success: false, message: "Failed to upload resume" });
  }
};

export const listMySessions = async (req: Request, res: Response) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: "Database is currently unavailable",
      });
    }

    const userId = (req as any).user?.id as string | undefined;
    const currentSid = (req as any).user?.sid as string | undefined;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const sessions = await Session.find({
      userId,
      revokedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    })
      .sort({ lastUsedAt: -1, createdAt: -1 })
      .limit(20);

    const data = sessions.map((s) => ({
      id: String(s._id),
      isCurrent: currentSid ? String(s._id) === currentSid : false,
      userAgent: s.userAgent || "",
      ipAddress: s.ipAddress || "",
      lastUsedAt: s.lastUsedAt ? s.lastUsedAt.toISOString() : null,
      createdAt: s.createdAt ? s.createdAt.toISOString() : null,
      expiresAt: s.expiresAt.toISOString(),
    }));

    return res.json({
      success: true,
      message: "Sessions loaded",
      data,
    });
  } catch (err) {
    console.error("listMySessions:", err);
    return res.status(500).json({ success: false, message: "Failed to load sessions" });
  }
};

export const revokeSession = async (req: Request, res: Response) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: "Database is currently unavailable",
      });
    }

    const userId = (req as any).user?.id as string | undefined;
    const currentSid = (req as any).user?.sid as string | undefined;
    const sessionId = req.params["sessionId"];
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ success: false, message: "Invalid session id" });
    }
    if (currentSid && currentSid === sessionId) {
      return res.status(400).json({
        success: false,
        message: "Use logout for current session",
      });
    }

    const result = await Session.updateOne(
      {
        _id: sessionId,
        userId,
        revokedAt: { $exists: false },
      },
      {
        $set: { revokedAt: new Date() },
      },
    );
    if (!result.matchedCount) {
      return res.status(404).json({ success: false, message: "Session not found" });
    }

    return res.json({
      success: true,
      message: "Session revoked",
      data: { sessionId },
    });
  } catch (err) {
    console.error("revokeSession:", err);
    return res.status(500).json({ success: false, message: "Failed to revoke session" });
  }
};
