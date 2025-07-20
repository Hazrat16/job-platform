import { Router } from "express";
import {
  forgotPassword,
  loginUser,
  registerUser,
  resetPassword,
  verifyEmail,
} from "../controllers/authController.js";
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

// Example of a protected route
router.get("/protected", authMiddleware, (req, res) => {
  res.json({ message: "You are authorized", user: (req as any).user });
});

export default router;
