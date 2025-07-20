import { Request, Response } from "express";
import User, { IUser } from "../models/userModel.js";

export const uploadProfilePhoto = async (req: Request, res: Response) => {
  try {
    const userId =
      (req as any).user.id || (req as any).user._id || (req as any).user.userId;

    const file = req.file;

    if (!file || !file.path) {
      return res.status(400).json({ error: "No photo uploaded" });
    }

    const updatedUser = (await User.findByIdAndUpdate(
      userId,
      { photo: file.path },
      { new: true }
    )) as IUser;

    return res.json({
      message: "Profile photo updated successfully",
      photo: updatedUser.photo,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to upload photo" });
  }
};
