import { Router } from "express";
import { analyzeResumeFit, rewriteResumeFit } from "../controllers/resumeFitController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import memoryUpload from "../middlewares/multerMemory.js";

const router = Router();

router.post(
  "/analyze",
  authMiddleware,
  (req, res, next) => {
    memoryUpload.single("resume")(req, res, (err: unknown) => {
      if (err) {
        const msg = err instanceof Error ? err.message : "Upload rejected";
        res.status(400).json({ success: false, message: msg });
        return;
      }
      next();
    });
  },
  analyzeResumeFit,
);

router.post("/rewrite", authMiddleware, rewriteResumeFit);

export default router;
