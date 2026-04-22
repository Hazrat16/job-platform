import { Router } from "express";
import {
  listAdminJobs,
  listAdminUsers,
  listDeletionRequests,
  moderateJob,
  moderateUser,
  reviewDeletionRequest,
} from "../controllers/adminController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requireRole } from "../middlewares/rbac.js";

const router = Router();

router.use(authMiddleware, requireRole("admin"));

router.get("/users", listAdminUsers);
router.patch("/users/:id", moderateUser);
router.get("/jobs", listAdminJobs);
router.patch("/jobs/:id", moderateJob);
router.get("/deletion-requests", listDeletionRequests);
router.patch("/deletion-requests/:id", reviewDeletionRequest);

export default router;
