import { Router } from "express";
import {
  getMyApplications,
  updateApplicationStatus,
} from "../controllers/applicationController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requireRole } from "../middlewares/rbac.js";
import { validateApplicationStatusInput } from "../middlewares/validateRequest.js";

const router = Router();

router.get("/", authMiddleware, requireRole("jobseeker"), getMyApplications);
router.patch(
  "/:applicationId",
  authMiddleware,
  requireRole("employer"),
  validateApplicationStatusInput,
  updateApplicationStatus,
);

export default router;
