import mongoose from "mongoose";
import { Request, Response } from "express";
import Notification from "../models/notificationModel.js";
import NotificationPreference from "../models/notificationPreferenceModel.js";
import { fail, ok } from "../utils/http.js";

export const listNotifications = async (req: Request, res: Response) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return fail(res, 503, "SERVICE_UNAVAILABLE", "Database is currently unavailable");
    }

    const userId = (req as any).user?.id as string | undefined;
    if (!userId) {
      return fail(res, 401, "UNAUTHORIZED", "Unauthorized");
    }

    const unreadOnly = req.query["unreadOnly"] === "true";
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query["limit"] || "30"), 10) || 30));

    const filter: Record<string, unknown> = { userId };
    if (unreadOnly) filter["read"] = false;

    const [items, unreadCount] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
      Notification.countDocuments({ userId, read: false }),
    ]);

    return ok(res, items, "Notifications loaded", 200, { unreadCount });
  } catch (err) {
    console.error("listNotifications:", err);
    return fail(res, 500, "INTERNAL_ERROR", "Failed to load notifications");
  }
};

export const markNotificationRead = async (req: Request, res: Response) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return fail(res, 503, "SERVICE_UNAVAILABLE", "Database is currently unavailable");
    }

    const userId = (req as any).user?.id as string | undefined;
    if (!userId) {
      return fail(res, 401, "UNAUTHORIZED", "Unauthorized");
    }

    const id = req.params["notificationId"];
    if (!id || !mongoose.isValidObjectId(id)) {
      return fail(res, 400, "BAD_REQUEST", "Invalid notification id");
    }

    const doc = await Notification.findOneAndUpdate(
      { _id: id, userId },
      { read: true },
      { new: true },
    ).lean();

    if (!doc) {
      return fail(res, 404, "NOT_FOUND", "Notification not found");
    }

    const unreadCount = await Notification.countDocuments({ userId, read: false });

    return ok(res, doc, "Marked as read", 200, { unreadCount });
  } catch (err) {
    console.error("markNotificationRead:", err);
    return fail(res, 500, "INTERNAL_ERROR", "Failed to update notification");
  }
};

export const markAllNotificationsRead = async (req: Request, res: Response) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return fail(res, 503, "SERVICE_UNAVAILABLE", "Database is currently unavailable");
    }

    const userId = (req as any).user?.id as string | undefined;
    if (!userId) {
      return fail(res, 401, "UNAUTHORIZED", "Unauthorized");
    }

    await Notification.updateMany({ userId, read: false }, { read: true });

    return ok(res, null, "All notifications marked read", 200, { unreadCount: 0 });
  } catch (err) {
    console.error("markAllNotificationsRead:", err);
    return fail(res, 500, "INTERNAL_ERROR", "Failed to mark all read");
  }
};

export const getNotificationPreferences = async (req: Request, res: Response) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return fail(res, 503, "SERVICE_UNAVAILABLE", "Database is currently unavailable");
    }
    const userId = (req as any).user?.id as string | undefined;
    if (!userId) return fail(res, 401, "UNAUTHORIZED", "Unauthorized");

    const prefs = await NotificationPreference.findOneAndUpdate(
      { userId },
      { $setOnInsert: { userId } },
      { upsert: true, new: true },
    ).lean();

    return ok(res, prefs, "Notification preferences loaded");
  } catch (err) {
    console.error("getNotificationPreferences:", err);
    return fail(res, 500, "INTERNAL_ERROR", "Failed to load notification preferences");
  }
};

export const updateNotificationPreferences = async (req: Request, res: Response) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return fail(res, 503, "SERVICE_UNAVAILABLE", "Database is currently unavailable");
    }
    const userId = (req as any).user?.id as string | undefined;
    if (!userId) return fail(res, 401, "UNAUTHORIZED", "Unauthorized");

    const body = req.body as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    const channels = ["inApp", "email"] as const;
    const keys = ["applicationReceived", "applicationStatus", "jobClosingSoon"] as const;
    for (const channel of channels) {
      const value = body[channel] as Record<string, unknown> | undefined;
      if (!value || typeof value !== "object") continue;
      for (const key of keys) {
        if (typeof value[key] === "boolean") {
          patch[`${channel}.${key}`] = value[key];
        }
      }
    }

    const prefs = await NotificationPreference.findOneAndUpdate(
      { userId },
      {
        $setOnInsert: { userId },
        ...(Object.keys(patch).length > 0 ? { $set: patch } : {}),
      },
      { upsert: true, new: true },
    ).lean();

    return ok(res, prefs, "Notification preferences updated");
  } catch (err) {
    console.error("updateNotificationPreferences:", err);
    return fail(res, 500, "INTERNAL_ERROR", "Failed to update notification preferences");
  }
};
