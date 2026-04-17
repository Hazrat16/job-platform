import mongoose, { Document, Schema } from "mongoose";

export interface IExperienceItem {
  title: string;
  company: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  current?: boolean;
  description?: string;
}

export interface IEducationItem {
  school: string;
  degree: string;
  field?: string;
  startYear?: string;
  endYear?: string;
  current?: boolean;
  description?: string;
}

export interface IUserProfile {
  headline?: string;
  bio?: string;
  phone?: string;
  location?: string;
  skills?: string[];
  linkedIn?: string;
  github?: string;
  portfolio?: string;
  resumeUrl?: string;
  experience?: IExperienceItem[];
  education?: IEducationItem[];
}

const experienceItemSchema = new Schema<IExperienceItem>(
  {
    title: { type: String, default: "", trim: true },
    company: { type: String, default: "", trim: true },
    location: { type: String, default: "", trim: true },
    startDate: { type: String, default: "", trim: true },
    endDate: { type: String, default: "", trim: true },
    current: { type: Boolean, default: false },
    description: { type: String, default: "", trim: true },
  },
  { _id: true },
);

const educationItemSchema = new Schema<IEducationItem>(
  {
    school: { type: String, default: "", trim: true },
    degree: { type: String, default: "", trim: true },
    field: { type: String, default: "", trim: true },
    startYear: { type: String, default: "", trim: true },
    endYear: { type: String, default: "", trim: true },
    current: { type: Boolean, default: false },
    description: { type: String, default: "", trim: true },
  },
  { _id: true },
);

const profileSchema = new Schema<IUserProfile>(
  {
    headline: { type: String, default: "", trim: true },
    bio: { type: String, default: "", trim: true },
    phone: { type: String, default: "", trim: true },
    location: { type: String, default: "", trim: true },
    skills: { type: [String], default: [] },
    linkedIn: { type: String, default: "", trim: true },
    github: { type: String, default: "", trim: true },
    portfolio: { type: String, default: "", trim: true },
    resumeUrl: { type: String, default: "", trim: true },
    experience: { type: [experienceItemSchema], default: [] },
    education: { type: [educationItemSchema], default: [] },
  },
  { _id: false },
);

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: string;
  isVerified: boolean;
  verificationToken?: string;
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  photo?: string;
  profile?: IUserProfile;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    role: { type: String, required: true },
    isVerified: { type: Boolean, default: false },
    verificationToken: { type: String },
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
    photo: { type: String },
    profile: { type: profileSchema, default: () => ({}) },
  },
  { timestamps: true },
);

const User = mongoose.model<IUser>("User", userSchema);

export default User;
