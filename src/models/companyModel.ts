import mongoose, { Document, Schema, Types } from "mongoose";

export const COMPANY_SIZES = [
  "1-10",
  "11-50",
  "51-200",
  "201-500",
  "501-1000",
  "1000+",
] as const;
export type CompanySize = (typeof COMPANY_SIZES)[number];

export interface ICompany extends Document {
  name: string;
  slug: string;
  logoUrl?: string;
  description: string;
  industry: string;
  size?: CompanySize;
  website?: string;
  location?: string;
  verified: boolean;
  createdBy: Types.ObjectId;
  members: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const companySchema = new Schema<ICompany>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true },
    logoUrl: { type: String, trim: true },
    description: { type: String, required: true, trim: true },
    industry: { type: String, required: true, trim: true },
    size: { type: String, enum: COMPANY_SIZES },
    website: { type: String, trim: true },
    location: { type: String, trim: true },
    verified: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    members: { type: [Schema.Types.ObjectId], ref: "User", default: [] },
  },
  { timestamps: true },
);

companySchema.index({ name: "text", description: "text", industry: "text" });

export { slugify as slugifyCompanyName };

const Company = mongoose.model<ICompany>("Company", companySchema);

export default Company;
