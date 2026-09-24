import { Router } from "express";
import type { Request, Response } from "express";
import {
  bootstrapAdmin,
  forgotPassword,
  loginUser,
  logoutAllSessions,
  logoutUser,
  refreshSession,
  registerUser,
  resetPassword,
  verifyEmail,
} from "../controllers/authController.js";
import User from "../models/userModel.js";
import { toPublicUser } from "../utils/userPublic.js";
import { uploadProfilePhoto } from "../controllers/userController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { rateLimit } from "../middlewares/rateLimit.js";
import upload from "../middlewares/upload.js";
import {
  validateForgotPasswordInput,
  validateLoginInput,
  validateRegisterInput,
  validateResetPasswordInput,
} from "../middlewares/validateRequest.js";
import { ok, fail } from "../utils/http.js";

const router = Router();

router.post(
  "/bootstrap-admin",
  rateLimit({ key: "auth-bootstrap-admin", windowMs: 60_000, max: 5 }),
  bootstrapAdmin,
);

router.post(
  "/register",
  rateLimit({ key: "auth-register", windowMs: 60_000, max: 8 }),
  upload.single("photo"),
  validateRegisterInput,
  registerUser
);
router.get("/verify-email", verifyEmail);
router.post(
  "/login",
  rateLimit({ key: "auth-login", windowMs: 60_000, max: 10 }),
  validateLoginInput,
  loginUser,
);
router.post(
  "/forgot-password",
  rateLimit({ key: "auth-forgot", windowMs: 60_000, max: 5 }),
  validateForgotPasswordInput,
  forgotPassword,
);
router.post(
  "/reset-password",
  rateLimit({ key: "auth-reset", windowMs: 60_000, max: 8 }),
  validateResetPasswordInput,
  resetPassword,
);
router.post(
  "/refresh",
  rateLimit({ key: "auth-refresh", windowMs: 60_000, max: 30 }),
  refreshSession,
);
router.post("/logout", authMiddleware, logoutUser);
router.post("/logout-all", authMiddleware, logoutAllSessions);
router.post(
  "/upload-photo",
  authMiddleware,
  upload.single("photo"),
  uploadProfilePhoto
);

router.get(
  "/protected",
  authMiddleware,
  async (req: Request, res: Response) => {
    const userId = (req as any).user?.id as string | undefined;
    if (!userId) {
      return fail(res, 401, "UNAUTHORIZED", "Unauthorized");
    }
    const user = await User.findById(userId);
    if (!user) {
      return fail(res, 404, "NOT_FOUND", "User not found");
    }
    return ok(res, toPublicUser(user), "Authorized");
  },
);

export default router;
