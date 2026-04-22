import { Router } from "express";
import {
  getMyProfile,
  listMySessions,
  requestMyDataDeletion,
  revokeSession,
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
router.get("/sessions", listMySessions);
router.delete("/sessions/:sessionId", revokeSession);
router.post("/data-deletion-request", requestMyDataDeletion);

export default router;
