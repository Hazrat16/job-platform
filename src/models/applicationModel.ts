import mongoose, { Document, Schema, Types } from "mongoose";

export interface IApplication extends Document {
  job: Types.ObjectId;
  applicant: Types.ObjectId;
  resume: string;
  coverLetter?: string;
  status: "pending" | "reviewed" | "shortlisted" | "rejected" | "accepted";
  createdAt: Date;
  updatedAt: Date;
}

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
