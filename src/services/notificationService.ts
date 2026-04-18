import mongoose from "mongoose";
import Notification, { NotificationType } from "../models/notificationModel.js";

type CreateParams = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  href?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Best-effort: never throws to callers — failures are logged only.
 */
export async function createNotification(params: CreateParams): Promise<void> {
  try {
    if (mongoose.connection.readyState !== 1) return;
    if (!params.userId || !mongoose.isValidObjectId(params.userId)) return;

    await Notification.create({
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body,
      read: false,
      href: params.href ?? "",
      metadata: params.metadata ?? {},
    });
  } catch (err) {
    console.error("createNotification:", err);
  }
}
