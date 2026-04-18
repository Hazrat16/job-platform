import mongoose from "mongoose";
import { Request, Response } from "express";
import Notification from "../models/notificationModel.js";

export const listNotifications = async (req: Request, res: Response) => {
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

    const unreadOnly = req.query["unreadOnly"] === "true";
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query["limit"] || "30"), 10) || 30));

    const filter: Record<string, unknown> = { userId };
    if (unreadOnly) filter["read"] = false;

    const [items, unreadCount] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
      Notification.countDocuments({ userId, read: false }),
    ]);

    return res.json({
      success: true,
      message: "Notifications loaded",
      data: items,
      meta: { unreadCount },
    });
  } catch (err) {
    console.error("listNotifications:", err);
    return res.status(500).json({ success: false, message: "Failed to load notifications" });
  }
};

export const markNotificationRead = async (req: Request, res: Response) => {
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

    const id = req.params["notificationId"];
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid notification id" });
    }

    const doc = await Notification.findOneAndUpdate(
      { _id: id, userId },
      { read: true },
      { new: true },
    ).lean();

    if (!doc) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }

    const unreadCount = await Notification.countDocuments({ userId, read: false });

    return res.json({
      success: true,
      message: "Marked as read",
      data: doc,
      meta: { unreadCount },
    });
  } catch (err) {
    console.error("markNotificationRead:", err);
    return res.status(500).json({ success: false, message: "Failed to update notification" });
  }
};

export const markAllNotificationsRead = async (req: Request, res: Response) => {
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

    await Notification.updateMany({ userId, read: false }, { read: true });

    return res.json({
      success: true,
      message: "All notifications marked read",
      meta: { unreadCount: 0 },
    });
  } catch (err) {
    console.error("markAllNotificationsRead:", err);
    return res.status(500).json({ success: false, message: "Failed to mark all read" });
  }
};
