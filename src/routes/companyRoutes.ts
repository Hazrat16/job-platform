import { Router } from "express";
import {
  addCompanyMember,
  createCompany,
  getCompany,
  getMyCompany,
  updateCompany,
} from "../controllers/companyController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requireRole } from "../middlewares/rbac.js";

const router = Router();

router.get("/mine", authMiddleware, requireRole("employer"), getMyCompany);
router.get("/:idOrSlug", getCompany);
router.post("/", authMiddleware, requireRole("employer"), createCompany);
router.patch("/:id", authMiddleware, requireRole("employer"), updateCompany);
router.post("/:id/members", authMiddleware, requireRole("employer"), addCompanyMember);

export default router;
