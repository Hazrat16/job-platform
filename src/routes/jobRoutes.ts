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
  updateJob,
} from "../controllers/jobController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import upload from "../middlewares/upload.js";

const router = Router();

router.get("/", getJobs);
router.get("/:id", getJobById);

router.post("/", authMiddleware, createJob);
router.put("/:id", authMiddleware, updateJob);
router.delete("/:id", authMiddleware, deleteJob);

router.post("/:jobId/apply", authMiddleware, upload.single("resume"), applyForJob);
router.get("/:jobId/applications", authMiddleware, getJobApplications);

export default router;
