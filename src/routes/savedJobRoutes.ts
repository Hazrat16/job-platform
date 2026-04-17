import { Router } from "express";
import {
  listSavedJobs,
  saveJob,
  unsaveJob,
} from "../controllers/savedJobController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = Router();

router.get("/", authMiddleware, listSavedJobs);
router.post("/", authMiddleware, saveJob);
router.delete("/:jobId", authMiddleware, unsaveJob);

export default router;
