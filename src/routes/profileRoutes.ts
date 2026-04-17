import { Router } from "express";
import {
  getMyProfile,
  updateMyProfile,
  uploadProfileResume,
} from "../controllers/profileController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import upload from "../middlewares/upload.js";

const router = Router();

router.use(authMiddleware);

router.get("/", getMyProfile);
router.patch("/", updateMyProfile);
router.post("/resume", upload.single("resume"), uploadProfileResume);

export default router;
