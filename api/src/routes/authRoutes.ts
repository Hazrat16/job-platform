import { Router } from "express";
import {
  loginUser,
  registerUser,
  verifyEmail,
} from "../controllers/authController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { validateRegisterInput } from "../middlewares/validateRegisterInput.js";

function asyncHandler(fn: any) {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

const router = Router();

router.post("/register", validateRegisterInput, asyncHandler(registerUser));
router.get("/verify-email", asyncHandler(verifyEmail));
router.post("/login", asyncHandler(loginUser));

// Example of a protected route
router.get("/protected", authMiddleware, (req, res) => {
  res.json({ message: "You are authorized", user: (req as any).user });
});

export default router;
