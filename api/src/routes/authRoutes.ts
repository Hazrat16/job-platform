// src/routes/authRoutes.ts
import { Router } from "express";
import {
  loginUser,
  registerUser,
  verifyEmail,
} from "../controllers/authController.js";

// Async wrapper to catch errors and forward to next()
function asyncHandler(fn: any) {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

const router = Router();

router.post("/register", asyncHandler(registerUser));
router.get("/verify-email", asyncHandler(verifyEmail));
router.post("/login", asyncHandler(loginUser));

export default router;
