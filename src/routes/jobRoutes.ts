import { Router } from "express";
import {
  applyForJob,
  getJobApplications,
} from "../controllers/applicationController.js";
import {
  createJob,
  deleteJob,
  getJobById,
  getJobs,
  getMyJobs,
  updateJob,
  updateJobLifecycleStatus,
} from "../controllers/jobController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { rateLimit } from "../middlewares/rateLimit.js";
import { requireRole } from "../middlewares/rbac.js";
import upload from "../middlewares/upload.js";
import {
  validateCreateJobInput,
  validateJobLifecycleStatusInput,
  validateUpdateJobInput,
} from "../middlewares/validateRequest.js";

const router = Router();

router.get("/", getJobs);
router.get("/mine", authMiddleware, requireRole("employer"), getMyJobs);
router.get("/:id", getJobById);

router.post(
  "/",
  authMiddleware,
  requireRole("employer"),
  validateCreateJobInput,
  createJob,
);
router.put(
  "/:id",
  authMiddleware,
  requireRole("employer"),
  validateUpdateJobInput,
  updateJob,
);
router.patch(
  "/:id/status",
  authMiddleware,
  requireRole("employer"),
  validateJobLifecycleStatusInput,
  updateJobLifecycleStatus,
);
router.delete("/:id", authMiddleware, requireRole("employer"), deleteJob);

router.post(
  "/:jobId/apply",
  authMiddleware,
  requireRole("jobseeker"),
  rateLimit({ key: "jobs-apply", windowMs: 60_000, max: 12 }),
  upload.single("resume"),
  applyForJob,
);
router.get(
  "/:jobId/applications",
  authMiddleware,
  requireRole("employer"),
  getJobApplications,
);

export default router;
