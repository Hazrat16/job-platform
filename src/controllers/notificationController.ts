import { Request, Response } from "express";
import * as userNotificationService from "../services/userNotificationService.js";
import { ok } from "../utils/http.js";

export const listNotifications = async (req: Request, res: Response) => {
  const userId = (req as any).user?.id as string | undefined;
  const unreadOnly = req.query["unreadOnly"] === "true";
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query["limit"] || "30"), 10) || 30));

  const { items, unreadCount } = await userNotificationService.listNotifications(userId, {
    unreadOnly,
    limit,
  });
  return ok(res, items, "Notifications loaded", 200, { unreadCount });
};

export const markNotificationRead = async (req: Request, res: Response) => {
  const userId = (req as any).user?.id as string | undefined;
  const { doc, unreadCount } = await userNotificationService.markNotificationRead(
    userId,
    req.params["notificationId"],
  );
  return ok(res, doc, "Marked as read", 200, { unreadCount });
};

export const markAllNotificationsRead = async (req: Request, res: Response) => {
  const userId = (req as any).user?.id as string | undefined;
  await userNotificationService.markAllNotificationsRead(userId);
  return ok(res, null, "All notifications marked read", 200, { unreadCount: 0 });
};

export const getNotificationPreferences = async (req: Request, res: Response) => {
  const userId = (req as any).user?.id as string | undefined;
  const prefs = await userNotificationService.getNotificationPreferences(userId);
  return ok(res, prefs, "Notification preferences loaded");
};

export const updateNotificationPreferences = async (req: Request, res: Response) => {
  const userId = (req as any).user?.id as string | undefined;
  const prefs = await userNotificationService.updateNotificationPreferences(
    userId,
    req.body as Record<string, unknown>,
  );
  return ok(res, prefs, "Notification preferences updated");
};
