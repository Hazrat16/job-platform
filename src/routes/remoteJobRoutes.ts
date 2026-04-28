import { Router } from "express";
import { listRemoteJobs } from "../controllers/remoteJobController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requireRole } from "../middlewares/rbac.js";

const router = Router();

router.get("/", authMiddleware, requireRole("jobseeker"), listRemoteJobs);

export default router;

