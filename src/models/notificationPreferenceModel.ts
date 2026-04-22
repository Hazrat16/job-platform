import mongoose, { Document, Schema, Types } from "mongoose";

export interface INotificationPreference extends Document {
  userId: Types.ObjectId;
  inApp: {
    applicationReceived: boolean;
    applicationStatus: boolean;
    jobClosingSoon: boolean;
  };
  email: {
    applicationReceived: boolean;
    applicationStatus: boolean;
    jobClosingSoon: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

const notificationPreferenceSchema = new Schema<INotificationPreference>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    inApp: {
      applicationReceived: { type: Boolean, default: true },
      applicationStatus: { type: Boolean, default: true },
      jobClosingSoon: { type: Boolean, default: true },
    },
    email: {
      applicationReceived: { type: Boolean, default: true },
      applicationStatus: { type: Boolean, default: true },
      jobClosingSoon: { type: Boolean, default: false },
    },
  },
  { timestamps: true },
);

const NotificationPreference = mongoose.model<INotificationPreference>(
  "NotificationPreference",
  notificationPreferenceSchema,
);

export default NotificationPreference;
