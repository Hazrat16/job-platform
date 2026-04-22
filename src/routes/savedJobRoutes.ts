import { Router } from "express";
import {
  listSavedJobs,
  saveJob,
  unsaveJob,
} from "../controllers/savedJobController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requireRole } from "../middlewares/rbac.js";

const router = Router();

router.get("/", authMiddleware, requireRole("jobseeker"), listSavedJobs);
router.post("/", authMiddleware, requireRole("jobseeker"), saveJob);
router.delete("/:jobId", authMiddleware, requireRole("jobseeker"), unsaveJob);

export default router;
