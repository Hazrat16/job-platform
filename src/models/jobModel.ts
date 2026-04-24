import mongoose, { Document, Schema, Types } from "mongoose";

interface ISalary {
  min: number;
  max: number;
  currency: string;
}

export interface IJob extends Document {
  title: string;
  company: string;
  location: string;
  type: "full-time" | "part-time" | "contract" | "internship";
  salary: ISalary;
  description: string;
  skills: string[];
  requirements: string[];
  benefits: string[];
  employer: Types.ObjectId;
  status: "active" | "closed" | "draft";
  deletedAt?: Date;
  deletedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

/** Legacy documents may omit these paths; coerce before API / toObject output. */
function normalizeJobArrays(ret: Record<string, unknown>): Record<string, unknown> {
  ret["requirements"] = Array.isArray(ret["requirements"]) ? ret["requirements"] : [];
  ret["benefits"] = Array.isArray(ret["benefits"]) ? ret["benefits"] : [];
  ret["skills"] = Array.isArray(ret["skills"]) ? ret["skills"] : [];
  return ret;
}

/** For `.lean()` queries — same defaults as `toJSON` / `toObject` transforms. */
export function coerceJobArrays<T extends Record<string, unknown>>(job: T): T {
  return {
    ...job,
    requirements: Array.isArray(job["requirements"]) ? job["requirements"] : [],
    benefits: Array.isArray(job["benefits"]) ? job["benefits"] : [],
    skills: Array.isArray(job["skills"]) ? job["skills"] : [],
  } as T;
}

const jobSchema = new Schema<IJob>(
  {
    title: { type: String, required: true, trim: true },
    company: { type: String, required: true, trim: true },
    location: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ["full-time", "part-time", "contract", "internship"],
      required: true,
    },
    salary: {
      min: { type: Number, required: true, min: 0 },
      max: { type: Number, required: true, min: 0 },
      currency: { type: String, required: true, trim: true, default: "USD" },
    },
    description: { type: String, required: true, trim: true },
    skills: { type: [String], default: () => [], trim: true },
    requirements: { type: [String], default: () => [], trim: true },
    benefits: { type: [String], default: () => [], trim: true },
    employer: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: ["active", "closed", "draft"],
      default: "active",
      required: true,
    },
    deletedAt: { type: Date, index: true },
    deletedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        return normalizeJobArrays(ret as Record<string, unknown>);
      },
    },
    toObject: {
      transform(_doc, ret) {
        return normalizeJobArrays(ret as Record<string, unknown>);
      },
    },
  },
);

jobSchema.index({ title: "text", company: "text", description: "text", skills: "text" });
jobSchema.index({ location: 1, type: 1, status: 1, createdAt: -1 });
jobSchema.index({ employer: 1, createdAt: -1 });

const Job = mongoose.model<IJob>("Job", jobSchema);

export default Job;
