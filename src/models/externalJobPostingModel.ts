import mongoose, { Document, Schema, Types } from "mongoose";

export interface IExternalJobPosting extends Document {
  source: Types.ObjectId;
  sourceCompanyKey: string;
  companyName: string;
  title: string;
  location: string;
  employmentType?: string;
  applyUrl: string;
  sourceUrl: string;
  descriptionSnippet?: string;
  datePosted?: Date;
  fingerprint: string;
  isActive: boolean;
  lastSeenAt: Date;
  raw?: Record<string, unknown>;
}

const externalJobPostingSchema = new Schema<IExternalJobPosting>(
  {
    source: { type: Schema.Types.ObjectId, ref: "ExternalJobSource", required: true, index: true },
    sourceCompanyKey: { type: String, required: true, index: true, trim: true },
    companyName: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true, index: true },
    location: { type: String, default: "", trim: true, index: true },
    employmentType: { type: String, default: "", trim: true },
    applyUrl: { type: String, required: true, trim: true },
    sourceUrl: { type: String, required: true, trim: true },
    descriptionSnippet: { type: String, default: "", trim: true },
    datePosted: { type: Date },
    fingerprint: { type: String, required: true, unique: true, index: true },
    isActive: { type: Boolean, default: true, index: true },
    lastSeenAt: { type: Date, required: true, default: Date.now, index: true },
    raw: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

externalJobPostingSchema.index({ source: 1, isActive: 1, lastSeenAt: -1 });

const ExternalJobPosting = mongoose.model<IExternalJobPosting>(
  "ExternalJobPosting",
  externalJobPostingSchema,
);

export default ExternalJobPosting;

