import mongoose, { Document, Schema, Types } from "mongoose";

export interface IApplicationStatusHistoryEntry {
  status: "pending" | "reviewed" | "shortlisted" | "rejected" | "accepted";
  changedAt: Date;
  note?: string;
}

export interface IApplication extends Document {
  job: Types.ObjectId;
  applicant: Types.ObjectId;
  resume: string;
  coverLetter?: string;
  status: "pending" | "reviewed" | "shortlisted" | "rejected" | "accepted";
  statusHistory: IApplicationStatusHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
}

const applicationStatusHistorySchema = new Schema<IApplicationStatusHistoryEntry>(
  {
    status: {
      type: String,
      enum: ["pending", "reviewed", "shortlisted", "rejected", "accepted"],
      required: true,
    },
    changedAt: { type: Date, required: true, default: Date.now },
    note: { type: String, trim: true },
  },
  { _id: false },
);

const applicationSchema = new Schema<IApplication>(
  {
    job: { type: Schema.Types.ObjectId, ref: "Job", required: true, index: true },
    applicant: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    resume: { type: String, required: true, trim: true },
    coverLetter: { type: String, trim: true },
    status: {
      type: String,
      enum: ["pending", "reviewed", "shortlisted", "rejected", "accepted"],
      default: "pending",
      required: true,
    },
    statusHistory: {
      type: [applicationStatusHistorySchema],
      default: () => [{ status: "pending", changedAt: new Date() }],
    },
  },
  { timestamps: true }
);

applicationSchema.index({ job: 1, applicant: 1 }, { unique: true });
applicationSchema.index({ applicant: 1, createdAt: -1 });

const Application = mongoose.model<IApplication>(
  "Application",
  applicationSchema
);

export default Application;
