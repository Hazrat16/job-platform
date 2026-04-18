import express, { Router } from "express";
import {
  initSslCommerz,
  listMyPayments,
  sslCallbackCancel,
  sslCallbackFail,
  sslCallbackSuccess,
  sslIpn,
} from "../controllers/paymentController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = Router();
const form = express.urlencoded({ extended: true });

router.post("/sslcommerz/callback/success", form, sslCallbackSuccess);
router.get("/sslcommerz/callback/success", sslCallbackSuccess);
router.post("/sslcommerz/callback/fail", form, sslCallbackFail);
router.get("/sslcommerz/callback/fail", sslCallbackFail);
router.post("/sslcommerz/callback/cancel", form, sslCallbackCancel);
router.get("/sslcommerz/callback/cancel", sslCallbackCancel);
router.post("/sslcommerz/ipn", form, sslIpn);

router.post("/sslcommerz/init", authMiddleware, initSslCommerz);
router.get("/me", authMiddleware, listMyPayments);

export default router;
