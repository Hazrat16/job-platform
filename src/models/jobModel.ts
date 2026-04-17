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
  requirements: string[];
  benefits: string[];
  employer: Types.ObjectId;
  status: "active" | "closed" | "draft";
  createdAt: Date;
  updatedAt: Date;
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
    requirements: [{ type: String, trim: true }],
    benefits: [{ type: String, trim: true }],
    employer: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: ["active", "closed", "draft"],
      default: "active",
      required: true,
    },
  },
  { timestamps: true }
);

jobSchema.index({ title: "text", company: "text", description: "text" });
jobSchema.index({ location: 1, type: 1, status: 1, createdAt: -1 });
jobSchema.index({ employer: 1, createdAt: -1 });

const Job = mongoose.model<IJob>("Job", jobSchema);

export default Job;
