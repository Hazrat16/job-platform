import { Router } from "express";
import {
  forgotPassword,
  loginUser,
  registerUser,
  resetPassword,
  verifyEmail,
} from "../controllers/authController.js";
import User from "../models/userModel.js";
import { toPublicUser } from "../utils/userPublic.js";
import { uploadProfilePhoto } from "../controllers/userController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import upload from "../middlewares/upload.js";
import { validateRegisterInput } from "../middlewares/validateRegisterInput.js";

function asyncHandler(fn: any) {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

const router = Router();

router.post(
  "/register",
  upload.single("photo"),
  validateRegisterInput,
  asyncHandler(registerUser)
);
router.get("/verify-email", asyncHandler(verifyEmail));
router.post("/login", asyncHandler(loginUser));
router.post("/forgot-password", asyncHandler(forgotPassword));
router.post("/reset-password", asyncHandler(resetPassword));
router.post(
  "/upload-photo",
  authMiddleware,
  upload.single("photo"),
  uploadProfilePhoto
);

router.get(
  "/protected",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const userId = (req as any).user?.id as string | undefined;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    return res.json({
      success: true,
      message: "Authorized",
      data: toPublicUser(user),
    });
  }),
);

export default router;
