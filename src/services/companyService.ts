import mongoose from "mongoose";
import Company, { COMPANY_SIZES, slugifyCompanyName, type CompanySize } from "../models/companyModel.js";
import Job from "../models/jobModel.js";
import User from "../models/userModel.js";
import { HttpError } from "../utils/http.js";
import type { AuthUser } from "./jobService.js";

function assertDbConnected(): void {
  if (mongoose.connection.readyState !== 1) {
    throw new HttpError(503, "SERVICE_UNAVAILABLE", "Database is currently unavailable");
  }
}

const COMPANY_WRITABLE_FIELDS = [
  "description",
  "industry",
  "size",
  "website",
  "location",
  "logoUrl",
] as const;

function pickCompanyWritableFields(body: Record<string, unknown>): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const field of COMPANY_WRITABLE_FIELDS) {
    if (body[field] !== undefined) picked[field] = body[field];
  }
  if (picked["size"] !== undefined && !COMPANY_SIZES.includes(picked["size"] as CompanySize)) {
    throw new HttpError(400, "BAD_REQUEST", `size must be one of: ${COMPANY_SIZES.join(", ")}`);
  }
  return picked;
}

async function generateUniqueSlug(name: string): Promise<string> {
  const base = slugifyCompanyName(name) || "company";
  let slug = base;
  let suffix = 1;
  while (await Company.exists({ slug })) {
    suffix += 1;
    slug = `${base}-${suffix}`;
  }
  return slug;
}

export type CreateCompanyInput = {
  name: string;
  description: string;
  industry: string;
  size?: string;
  website?: string;
  location?: string;
  logoUrl?: string;
};

export async function createCompany(user: AuthUser, body: CreateCompanyInput) {
  assertDbConnected();

  if (!body.name || body.name.trim().length < 2) {
    throw new HttpError(400, "BAD_REQUEST", "Company name is required (min 2 characters)");
  }
  if (!body.description || body.description.trim().length < 20) {
    throw new HttpError(400, "BAD_REQUEST", "Description must be at least 20 characters");
  }
  if (!body.industry || body.industry.trim().length < 2) {
    throw new HttpError(400, "BAD_REQUEST", "Industry is required");
  }

  const existingUser = await User.findById(user.id);
  if (!existingUser) {
    throw new HttpError(404, "NOT_FOUND", "User not found");
  }
  if (existingUser.companyId) {
    throw new HttpError(409, "CONFLICT", "You already belong to a company");
  }

  const slug = await generateUniqueSlug(body.name);
  const company = await Company.create({
    name: body.name.trim(),
    slug,
    description: body.description.trim(),
    industry: body.industry.trim(),
    size: body.size,
    website: body.website,
    location: body.location,
    logoUrl: body.logoUrl,
    createdBy: existingUser._id,
    members: [existingUser._id],
  });

  existingUser.companyId = company._id as mongoose.Types.ObjectId;
  await existingUser.save();

  return company.toObject();
}

export async function getCompanyByIdOrSlug(idOrSlug: string | undefined) {
  assertDbConnected();
  if (!idOrSlug) {
    throw new HttpError(400, "BAD_REQUEST", "Company id or slug is required");
  }

  const query = mongoose.Types.ObjectId.isValid(idOrSlug)
    ? { _id: idOrSlug }
    : { slug: idOrSlug };
  const company = await Company.findOne(query).lean();
  if (!company) {
    throw new HttpError(404, "NOT_FOUND", "Company not found");
  }

  const jobs = await Job.find({
    companyId: company._id,
    deletedAt: { $exists: false },
    status: "active",
  })
    .select("title location type salary createdAt")
    .sort({ createdAt: -1 })
    .lean();

  return { company, jobs };
}

export async function getMyCompany(user: AuthUser) {
  assertDbConnected();

  const existingUser = await User.findById(user.id);
  if (!existingUser?.companyId) {
    throw new HttpError(404, "NOT_FOUND", "You don't belong to a company yet");
  }

  const company = await Company.findById(existingUser.companyId).lean();
  if (!company) {
    throw new HttpError(404, "NOT_FOUND", "Company not found");
  }
  return company;
}

async function loadCompanyForMember(companyId: string | undefined, user: AuthUser) {
  const company = await Company.findById(companyId);
  if (!company) {
    throw new HttpError(404, "NOT_FOUND", "Company not found");
  }
  const isMember = company.members.some((m) => m.toString() === user.id);
  if (!isMember) {
    throw new HttpError(403, "FORBIDDEN", "Not authorized to manage this company");
  }
  return company;
}

export async function updateCompany(
  user: AuthUser,
  companyId: string | undefined,
  body: Record<string, unknown>,
) {
  assertDbConnected();

  const company = await loadCompanyForMember(companyId, user);
  const picked = pickCompanyWritableFields(body);
  Object.assign(company, picked);
  await company.save();
  return company.toObject();
}

export async function addCompanyMember(
  user: AuthUser,
  companyId: string | undefined,
  memberEmail: string,
) {
  assertDbConnected();

  const company = await loadCompanyForMember(companyId, user);

  const target = await User.findOne({ email: memberEmail.trim().toLowerCase() });
  if (!target) {
    throw new HttpError(404, "NOT_FOUND", "No user found with that email");
  }
  if (target.role !== "employer") {
    throw new HttpError(400, "BAD_REQUEST", "Only employer accounts can join a company");
  }
  if (target.companyId) {
    throw new HttpError(409, "CONFLICT", "That user already belongs to a company");
  }

  target.companyId = company._id as mongoose.Types.ObjectId;
  await target.save();
  company.members.push(target._id as mongoose.Types.ObjectId);
  await company.save();

  return company.toObject();
}
