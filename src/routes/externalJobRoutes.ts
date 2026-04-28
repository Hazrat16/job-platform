import { Router } from "express";
import {
  listExternalJobs,
  listExternalSources,
  syncSources,
} from "../controllers/externalJobController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requireRole } from "../middlewares/rbac.js";

const router = Router();

router.get("/sources", listExternalSources);
router.get("/jobs", listExternalJobs);
router.post("/sources/sync", authMiddleware, requireRole("admin"), syncSources);

export default router;

