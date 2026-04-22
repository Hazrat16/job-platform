import { Request, Response } from "express";
import User, { IUser } from "../models/userModel.js";
import { toPublicUser } from "../utils/userPublic.js";
import { fail, ok } from "../utils/http.js";

export const uploadProfilePhoto = async (req: Request, res: Response) => {
  try {
    const userId =
      (req as any).user.id || (req as any).user._id || (req as any).user.userId;

    const file = req.file;

    if (!file || !file.path) {
      return fail(res, 400, "BAD_REQUEST", "No photo uploaded");
    }

    const updatedUser = (await User.findByIdAndUpdate(
      userId,
      { photo: file.path },
      { new: true }
    )) as IUser;

    return ok(
      res,
      {
        photo: updatedUser.photo,
        user: toPublicUser(updatedUser),
      },
      "Profile photo updated successfully",
    );
  } catch (err) {
    console.error(err);
    return fail(res, 500, "INTERNAL_ERROR", "Failed to upload photo");
  }
};
