import mongoose from "mongoose";
import DataDeletionRequest from "../models/dataDeletionRequestModel.js";
import Session from "../models/sessionModel.js";
import User, {
  IEducationItem,
  IExperienceItem,
  IUser,
  IUserProfile,
} from "../models/userModel.js";
import { HttpError } from "../utils/http.js";
import { toPublicUser } from "../utils/userPublic.js";

const MAX_ITEMS = 25;

function assertDbConnected(): void {
  if (mongoose.connection.readyState !== 1) {
    throw new HttpError(503, "SERVICE_UNAVAILABLE", "Database is currently unavailable");
  }
}

function requireUserId(userId: string | undefined): string {
  if (!userId) {
    throw new HttpError(401, "UNAUTHORIZED", "Unauthorized");
  }
  return userId;
}

async function loadUser(userId: string) {
  const user = await User.findById(userId);
  if (!user) {
    throw new HttpError(404, "NOT_FOUND", "User not found");
  }
  return user;
}

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
      description: typeof o["description"] === "string" ? o["description"].trim() : "",
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
      description: typeof o["description"] === "string" ? o["description"].trim() : "",
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

  const basics = Boolean(p.phone && p.phone.trim().length > 0 && p.location && p.location.trim().length > 0);
  const summary = Boolean(
    p.headline && p.headline.trim().length >= 3 && p.bio && p.bio.trim().length >= 20,
  );
  const skillsOk = skills.length >= 1;
  const experienceOk = experience.some((x) => Boolean(x.title?.trim() && x.company?.trim()));
  const educationOk = education.some((x) => Boolean(x.school?.trim() && x.degree?.trim()));
  const resumeOk = Boolean(p.resumeUrl && p.resumeUrl.trim().length > 0);
  const linksOk = Boolean(
    (p.linkedIn && p.linkedIn.trim()) || (p.github && p.github.trim()) || (p.portfolio && p.portfolio.trim()),
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
  if (!experienceOk) missingTips.push("Add at least one work experience with a job title and company.");
  if (!educationOk) missingTips.push("Add at least one education entry with school and degree.");
  if (!resumeOk) missingTips.push("Upload a résumé from the Résumé page.");
  if (!linksOk) missingTips.push("Add a LinkedIn, GitHub, or portfolio link to strengthen your profile.");

  return { percent, sections, missingTips };
}

function userResponsePayload(user: IUser) {
  return {
    ...toPublicUser(user),
    profileCompleteness: computeProfileCompleteness(user),
  };
}

export async function getMyProfile(userId: string | undefined) {
  assertDbConnected();
  const uid = requireUserId(userId);
  const user = await loadUser(uid);
  return userResponsePayload(user);
}

export async function updateMyProfile(
  userId: string | undefined,
  input: { name?: string | undefined; profile?: Record<string, unknown> | undefined },
) {
  assertDbConnected();
  const uid = requireUserId(userId);
  const user = await loadUser(uid);

  if (typeof input.name === "string" && input.name.trim().length >= 2) {
    user.name = input.name.trim();
  }

  if (input.profile && typeof input.profile === "object") {
    const merged = mergeProfile(user.profile, input.profile);
    if (user.profile?.resumeUrl) {
      merged.resumeUrl = user.profile.resumeUrl;
    }
    user.profile = merged;
  }

  await user.save();
  return userResponsePayload(user);
}

export async function uploadProfileResume(userId: string | undefined, resumeUrl: string | undefined) {
  assertDbConnected();
  const uid = requireUserId(userId);
  if (!resumeUrl) {
    throw new HttpError(400, "BAD_REQUEST", "No resume file uploaded");
  }

  const user = await loadUser(uid);
  const merged = mergeProfile(user.profile, {});
  merged.resumeUrl = resumeUrl;
  user.profile = merged;
  await user.save();

  return { resumeUrl, user: userResponsePayload(user) };
}

export async function listMySessions(userId: string | undefined, currentSid: string | undefined) {
  assertDbConnected();
  const uid = requireUserId(userId);

  const sessions = await Session.find({
    userId: uid,
    revokedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  })
    .sort({ lastUsedAt: -1, createdAt: -1 })
    .limit(20);

  return sessions.map((s) => ({
    id: String(s._id),
    isCurrent: currentSid ? String(s._id) === currentSid : false,
    userAgent: s.userAgent || "",
    ipAddress: s.ipAddress || "",
    lastUsedAt: s.lastUsedAt ? s.lastUsedAt.toISOString() : null,
    createdAt: s.createdAt ? s.createdAt.toISOString() : null,
    expiresAt: s.expiresAt.toISOString(),
  }));
}

export async function revokeSession(
  userId: string | undefined,
  currentSid: string | undefined,
  sessionId: string | undefined,
) {
  assertDbConnected();
  const uid = requireUserId(userId);

  if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
    throw new HttpError(400, "BAD_REQUEST", "Invalid session id");
  }
  if (currentSid && currentSid === sessionId) {
    throw new HttpError(400, "BAD_REQUEST", "Use logout for current session");
  }

  const result = await Session.updateOne(
    { _id: sessionId, userId: uid, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
  );
  if (!result.matchedCount) {
    throw new HttpError(404, "NOT_FOUND", "Session not found");
  }

  return { sessionId };
}

export async function requestMyDataDeletion(userId: string | undefined, reason: string) {
  assertDbConnected();
  const uid = requireUserId(userId);

  const existingPending = await DataDeletionRequest.findOne({
    userId: uid,
    status: "pending",
  }).select("_id");
  if (existingPending) {
    throw new HttpError(409, "CONFLICT", "A pending deletion request already exists");
  }

  return DataDeletionRequest.create({
    userId: uid,
    reason,
    status: "pending",
    requestedAt: new Date(),
  });
}

export async function uploadProfilePhoto(userId: string | undefined, photoUrl: string | undefined) {
  const uid = requireUserId(userId);
  if (!photoUrl) {
    throw new HttpError(400, "BAD_REQUEST", "No photo uploaded");
  }

  const user = await User.findByIdAndUpdate(uid, { photo: photoUrl }, { new: true });
  if (!user) {
    throw new HttpError(404, "NOT_FOUND", "User not found");
  }

  return { photo: user.photo, user: toPublicUser(user) };
}
