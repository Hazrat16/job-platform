import { Router } from "express";
import {
  getMyApplications,
  updateApplicationStatus,
} from "../controllers/applicationController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = Router();

router.get("/", authMiddleware, getMyApplications);
router.patch("/:applicationId", authMiddleware, updateApplicationStatus);

export default router;
