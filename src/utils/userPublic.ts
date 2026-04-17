import type { IUser } from "../models/userModel.js";

export type PublicUser = {
  _id: string;
  name: string;
  email: string;
  role: string;
  isVerified: boolean;
  photo?: string;
  profile: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
};

export function toPublicUser(user: IUser): PublicUser {
  const u = user as IUser & { createdAt?: Date; updatedAt?: Date };
  const out: PublicUser = {
    _id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    isVerified: user.isVerified,
    profile: user.profile
      ? (user.profile as unknown as Record<string, unknown>)
      : {},
  };
  if (user.photo && user.photo.length > 0) {
    out.photo = user.photo;
  }
  if (u.createdAt) {
    out.createdAt = u.createdAt.toISOString();
  }
  if (u.updatedAt) {
    out.updatedAt = u.updatedAt.toISOString();
  }
  return out;
}
