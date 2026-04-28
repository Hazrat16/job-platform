import mongoose, { Document, Schema } from "mongoose";

export interface IExternalJobSource extends Document {
  companyKey: string;
  companyName: string;
  careersUrl: string;
  phase: number;
  enabled: boolean;
  parserType: "json_ld";
  crawlIntervalMinutes: number;
  lastCrawledAt?: Date;
  lastSuccessAt?: Date;
  lastError?: string;
}

const externalJobSourceSchema = new Schema<IExternalJobSource>(
  {
    companyKey: { type: String, required: true, unique: true, index: true, trim: true },
    companyName: { type: String, required: true, trim: true },
    careersUrl: { type: String, required: true, trim: true },
    phase: { type: Number, required: true, default: 1, index: true },
    enabled: { type: Boolean, default: true, index: true },
    parserType: { type: String, enum: ["json_ld"], default: "json_ld", required: true },
    crawlIntervalMinutes: { type: Number, default: 60 * 12, min: 5 },
    lastCrawledAt: { type: Date },
    lastSuccessAt: { type: Date },
    lastError: { type: String, default: "" },
  },
  { timestamps: true },
);

const ExternalJobSource = mongoose.model<IExternalJobSource>(
  "ExternalJobSource",
  externalJobSourceSchema,
);

export default ExternalJobSource;

