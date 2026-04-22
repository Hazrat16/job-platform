import mongoose, { Document, Schema, Types } from "mongoose";
import { NotificationType } from "./notificationModel.js";

export interface INotificationJob extends Document {
  userId: Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  href?: string;
  metadata?: Record<string, unknown>;
  channel: "in_app" | "email";
  status: "queued" | "processing" | "failed" | "dead_letter" | "done";
  attempts: number;
  maxAttempts: number;
  runAt: Date;
  lockedAt?: Date;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

const notificationJobSchema = new Schema<INotificationJob>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: ["application_received", "application_status", "job_closing_soon"],
      required: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    href: { type: String, trim: true, default: "" },
    metadata: { type: Schema.Types.Mixed, default: {} },
    channel: { type: String, enum: ["in_app", "email"], required: true, default: "in_app" },
    status: {
      type: String,
      enum: ["queued", "processing", "failed", "dead_letter", "done"],
      default: "queued",
      index: true,
    },
    attempts: { type: Number, default: 0, min: 0 },
    maxAttempts: { type: Number, default: 5, min: 1 },
    runAt: { type: Date, default: Date.now, index: true },
    lockedAt: { type: Date },
    lastError: { type: String, trim: true, default: "" },
  },
  { timestamps: true },
);

notificationJobSchema.index({ status: 1, runAt: 1, createdAt: 1 });

const NotificationJob = mongoose.model<INotificationJob>(
  "NotificationJob",
  notificationJobSchema,
);

export default NotificationJob;
