import mongoose from "mongoose";
import Notification from "../models/notificationModel.js";
import NotificationPreference from "../models/notificationPreferenceModel.js";
import { HttpError } from "../utils/http.js";

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

export async function listNotifications(
  userId: string | undefined,
  options: { unreadOnly: boolean; limit: number },
) {
  assertDbConnected();
  const uid = requireUserId(userId);

  const filter: Record<string, unknown> = { userId: uid };
  if (options.unreadOnly) filter["read"] = false;

  const [items, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).limit(options.limit).lean(),
    Notification.countDocuments({ userId: uid, read: false }),
  ]);

  return { items, unreadCount };
}

export async function markNotificationRead(userId: string | undefined, notificationId: string | undefined) {
  assertDbConnected();
  const uid = requireUserId(userId);

  if (!notificationId || !mongoose.isValidObjectId(notificationId)) {
    throw new HttpError(400, "BAD_REQUEST", "Invalid notification id");
  }

  const doc = await Notification.findOneAndUpdate(
    { _id: notificationId, userId: uid },
    { read: true },
    { new: true },
  ).lean();
  if (!doc) {
    throw new HttpError(404, "NOT_FOUND", "Notification not found");
  }

  const unreadCount = await Notification.countDocuments({ userId: uid, read: false });
  return { doc, unreadCount };
}

export async function markAllNotificationsRead(userId: string | undefined): Promise<void> {
  assertDbConnected();
  const uid = requireUserId(userId);
  await Notification.updateMany({ userId: uid, read: false }, { read: true });
}

export async function getNotificationPreferences(userId: string | undefined) {
  assertDbConnected();
  const uid = requireUserId(userId);

  return NotificationPreference.findOneAndUpdate(
    { userId: uid },
    { $setOnInsert: { userId: uid } },
    { upsert: true, new: true },
  ).lean();
}

const PREFERENCE_CHANNELS = ["inApp", "email"] as const;
const PREFERENCE_KEYS = ["applicationReceived", "applicationStatus", "jobClosingSoon"] as const;

export async function updateNotificationPreferences(
  userId: string | undefined,
  body: Record<string, unknown>,
) {
  assertDbConnected();
  const uid = requireUserId(userId);

  const patch: Record<string, unknown> = {};
  for (const channel of PREFERENCE_CHANNELS) {
    const value = body[channel] as Record<string, unknown> | undefined;
    if (!value || typeof value !== "object") continue;
    for (const key of PREFERENCE_KEYS) {
      if (typeof value[key] === "boolean") {
        patch[`${channel}.${key}`] = value[key];
      }
    }
  }

  return NotificationPreference.findOneAndUpdate(
    { userId: uid },
    {
      $setOnInsert: { userId: uid },
      ...(Object.keys(patch).length > 0 ? { $set: patch } : {}),
    },
    { upsert: true, new: true },
  ).lean();
}
