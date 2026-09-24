import { Request, Response } from "express";
import mongoose from "mongoose";
import Job from "../models/jobModel.js";
import Payment from "../models/paymentModel.js";
import User from "../models/userModel.js";
import {
  initiateHostedCheckout,
  validateTransactionByValId,
} from "../services/sslcommerzService.js";
import { logError } from "../utils/logger.js";

type JwtUser = { id: string; role: string };

/** Server-controlled pricing — never trust a client-supplied amount for a paid feature. */
const JOB_BOOST_PRICE_PER_DAY_BDT = 100;
const JOB_BOOST_MIN_DAYS = 1;
const JOB_BOOST_MAX_DAYS = 30;

function sslConfig(): {
  storeId: string;
  storePassword: string;
  isSandbox: boolean;
  apiPublic: string;
  frontendUrl: string;
} {
  const port = process.env["PORT"] || "5000";
  const apiPublic = (
    process.env["API_PUBLIC_BASE_URL"] || `http://127.0.0.1:${port}`
  ).replace(/\/$/, "");
  const frontendUrl = (process.env["FRONTEND_URL"] || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  const isSandbox =
    (process.env["SSLCOMMERZ_IS_SANDBOX"] || "true").toLowerCase() !== "false";
  let storeId = (process.env["SSLCOMMERZ_STORE_ID"] || "").trim();
  let storePassword = (process.env["SSLCOMMERZ_STORE_PASSWORD"] || "").trim();
  const allowTestbox =
    process.env["SSLCOMMERZ_ALLOW_TESTBOX"] === "true" ||
    process.env["SSLCOMMERZ_ALLOW_TESTBOX"] === "1";
  if ((!storeId || !storePassword) && isSandbox && allowTestbox) {
    storeId = "testbox";
    storePassword = "qwerty";
    if (process.env["NODE_ENV"] !== "test") {
      console.warn(
        "[payments] SSLCOMMERZ_ALLOW_TESTBOX is set: using public sandbox merchant credentials (testbox). Do not use in production.",
      );
    }
  }
  return {
    storeId,
    storePassword,
    isSandbox,
    apiPublic,
    frontendUrl,
  };
}

function redirectFrontend(res: Response, params: Record<string, string>) {
  const { frontendUrl } = sslConfig();
  const u = new URL(frontendUrl);
  u.pathname = "/payments";
  for (const [k, v] of Object.entries(params)) {
    u.searchParams.set(k, v);
  }
  res.redirect(302, u.toString());
}

function mergeForm(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.query)) {
    if (v === undefined) continue;
    out[k] = Array.isArray(v) ? String(v[0]) : String(v);
  }
  if (req.body && typeof req.body === "object") {
    for (const [k, v] of Object.entries(req.body as Record<string, unknown>)) {
      if (v === undefined || v === null) continue;
      out[k] = String(v);
    }
  }
  return out;
}

function parseAmount(v: string | number | undefined): number | null {
  if (v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

async function tryCompletePayment(tranId: string, valId: string | undefined) {
  const { storeId, storePassword, isSandbox } = sslConfig();
  if (!valId) {
    return { ok: false as const, reason: "missing_val_id" };
  }

  const payment = await Payment.findOne({ tranId });
  if (!payment) {
    return { ok: false as const, reason: "payment_not_found" };
  }
  if (payment.status === "completed") {
    return { ok: true as const, duplicate: true };
  }

  const validation = await validateTransactionByValId(
    valId,
    storeId,
    storePassword,
    isSandbox,
  );
  if (!validation) {
    return { ok: false as const, reason: "validation_failed" };
  }

  const vStatus = String(validation.status || "");
  if (vStatus !== "VALID" && vStatus !== "VALIDATED") {
    return { ok: false as const, reason: "invalid_transaction_status" };
  }
  if (String(validation.tran_id || "") !== tranId) {
    return { ok: false as const, reason: "tran_id_mismatch" };
  }

  const amountSsl = parseAmount(validation.amount);
  if (amountSsl === null || Math.abs(amountSsl - payment.amount) > 0.05) {
    return { ok: false as const, reason: "amount_mismatch" };
  }

  const cur = String(validation.currency_type || "").toUpperCase();
  if (cur && cur !== payment.currency.toUpperCase()) {
    return { ok: false as const, reason: "currency_mismatch" };
  }

  payment.status = "completed";
  payment.valId = valId;
  if (validation.bank_tran_id) {
    payment.bankTranId = String(validation.bank_tran_id);
  }
  await payment.save();

  if (payment.purpose === "job_boost" && payment.jobId && payment.boostDays) {
    await applyJobBoost(payment.jobId, payment.boostDays).catch((err) => {
      logError("job_boost_apply_failed", { paymentId: String(payment._id), error: String(err) });
    });
  }

  return { ok: true as const, duplicate: false };
}

/** Extends from the later of "now" or the job's current featuredUntil, so stacking boosts adds up rather than overwriting. */
async function applyJobBoost(jobId: mongoose.Types.ObjectId, boostDays: number): Promise<void> {
  const job = await Job.findById(jobId);
  if (!job) return;

  const now = new Date();
  const base = job.featuredUntil && job.featuredUntil > now ? job.featuredUntil : now;
  job.featuredUntil = new Date(base.getTime() + boostDays * 24 * 60 * 60 * 1000);
  await job.save();
}

export const initSslCommerz = async (req: Request, res: Response) => {
  try {
    const jwtUser = (req as Request & { user: JwtUser }).user;
    if (!jwtUser || jwtUser.role !== "employer") {
      return res.status(403).json({
        success: false,
        message: "Only employers can start a payment",
      });
    }

    const { storeId, storePassword, isSandbox, apiPublic } = sslConfig();
    if (!storeId || !storePassword) {
      return res.status(503).json({
        success: false,
        message:
          "SSLCOMMERZ store credentials missing. Set SSLCOMMERZ_STORE_ID and SSLCOMMERZ_STORE_PASSWORD in the API .env (from https://developer.sslcommerz.com for your sandbox store). For local sandbox only, you may set SSLCOMMERZ_ALLOW_TESTBOX=true to use the public sandbox pair testbox / qwerty from SSLCOMMERZ docs.",
      });
    }

    const body = req.body as { amount?: unknown; purpose?: unknown; jobId?: unknown; boostDays?: unknown };
    const purpose = body.purpose === "job_boost" ? "job_boost" : "wallet_topup";

    let amount: number;
    let jobId: mongoose.Types.ObjectId | undefined;
    let boostDays: number | undefined;
    let productName = "Job platform wallet top-up";

    if (purpose === "job_boost") {
      const jobIdRaw = String(body.jobId || "");
      if (!mongoose.Types.ObjectId.isValid(jobIdRaw)) {
        return res.status(400).json({ success: false, message: "A valid jobId is required" });
      }
      boostDays = Math.trunc(Number(body.boostDays));
      if (
        !Number.isFinite(boostDays) ||
        boostDays < JOB_BOOST_MIN_DAYS ||
        boostDays > JOB_BOOST_MAX_DAYS
      ) {
        return res.status(400).json({
          success: false,
          message: `boostDays must be between ${JOB_BOOST_MIN_DAYS} and ${JOB_BOOST_MAX_DAYS}`,
        });
      }

      const job = await Job.findOne({ _id: jobIdRaw, deletedAt: { $exists: false } });
      if (!job) {
        return res.status(404).json({ success: false, message: "Job not found" });
      }
      if (job.employer.toString() !== jwtUser.id) {
        return res.status(403).json({ success: false, message: "You don't own this job" });
      }

      jobId = job._id as mongoose.Types.ObjectId;
      // Amount is always computed server-side from boostDays — never trust a client-supplied amount for a paid feature.
      amount = boostDays * JOB_BOOST_PRICE_PER_DAY_BDT;
      productName = `Featured job boost (${boostDays} day${boostDays === 1 ? "" : "s"}) — ${job.title}`;
    } else {
      const rawAmount = body.amount;
      amount = typeof rawAmount === "number" ? rawAmount : parseFloat(String(rawAmount || ""));
      if (!Number.isFinite(amount) || amount < 10 || amount > 500_000) {
        return res.status(400).json({
          success: false,
          message: "Amount must be between 10 and 500000 BDT",
        });
      }
    }

    const user = await User.findById(jwtUser.id).lean();
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const tranId = `JP${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.slice(
      0,
      30,
    );

    const profile = user.profile || {};
    const phone = (profile.phone || "01700000000").replace(/\D/g, "").slice(0, 20) || "01700000000";
    const city = (profile.location || "Dhaka").slice(0, 50);
    const customer = {
      name: (user.name || "Customer").slice(0, 50),
      email: (user.email || "customer@example.com").slice(0, 50),
      phone,
      address1: (profile.location || "Dhaka").slice(0, 50),
      city,
      country: "Bangladesh",
      postcode: "1000",
    };

    const cbBase = `${apiPublic}/api/payments/sslcommerz/callback`;
    const ipnBase = `${apiPublic}/api/payments/sslcommerz/ipn`;

    await Payment.create({
      user: new mongoose.Types.ObjectId(jwtUser.id),
      tranId,
      amount,
      currency: "BDT",
      status: "pending",
      purpose,
      jobId,
      boostDays,
    });

    const session = await initiateHostedCheckout({
      storeId,
      storePassword,
      isSandbox,
      tranId,
      totalAmount: amount,
      successUrl: `${cbBase}/success`,
      failUrl: `${cbBase}/fail`,
      cancelUrl: `${cbBase}/cancel`,
      ipnUrl: ipnBase,
      customer,
      productName,
      productCategory: "service",
    });

    if (!session.ok) {
      await Payment.deleteOne({ tranId }).catch(() => undefined);
      return res.status(502).json({
        success: false,
        message: session.message,
      });
    }

    if (session.sessionKey) {
      await Payment.updateOne({ tranId }, { $set: { sessionKey: session.sessionKey } }).catch(
        () => undefined,
      );
    }

    return res.json({
      success: true,
      message: "Redirect customer to gatewayUrl",
      data: { gatewayUrl: session.gatewayUrl, tranId },
    });
  } catch (e) {
    console.error("initSslCommerz", e);
    return res.status(500).json({
      success: false,
      message: e instanceof Error ? e.message : "Payment init failed",
    });
  }
};

export const listMyPayments = async (req: Request, res: Response) => {
  try {
    const jwtUser = (req as Request & { user: JwtUser }).user;
    if (!jwtUser) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const rows = await Payment.find({ user: jwtUser.id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return res.json({
      success: true,
      message: "Payments fetched",
      data: rows,
    });
  } catch (e) {
    console.error("listMyPayments", e);
    return res.status(500).json({
      success: false,
      message: e instanceof Error ? e.message : "Failed to list payments",
    });
  }
};

export const sslCallbackSuccess = async (req: Request, res: Response) => {
  const p = mergeForm(req);
  const tranId = p["tran_id"] || "";
  const valId = p["val_id"];

  const result = await tryCompletePayment(tranId, valId);
  if (!result.ok) {
    if (tranId) {
      await Payment.updateOne(
        { tranId, status: "pending" },
        { $set: { status: "failed" } },
      ).catch(() => undefined);
    }
    return redirectFrontend(res, { ssl: "fail", reason: "validation" });
  }

  return redirectFrontend(res, { ssl: "success", tran_id: tranId });
};

export const sslCallbackFail = async (req: Request, res: Response) => {
  const p = mergeForm(req);
  const tranId = p["tran_id"] || "";
  if (tranId) {
    await Payment.updateOne(
      { tranId, status: "pending" },
      { $set: { status: "failed" } },
    ).catch(() => undefined);
  }
  return redirectFrontend(res, { ssl: "fail", tran_id: tranId });
};

export const sslCallbackCancel = async (req: Request, res: Response) => {
  const p = mergeForm(req);
  const tranId = p["tran_id"] || "";
  if (tranId) {
    await Payment.updateOne(
      { tranId, status: "pending" },
      { $set: { status: "cancelled" } },
    ).catch(() => undefined);
  }
  return redirectFrontend(res, { ssl: "cancel", tran_id: tranId });
};

export const sslIpn = async (req: Request, res: Response) => {
  const p = mergeForm(req);
  const tranId = p["tran_id"] || "";
  const valId = p["val_id"];
  const postStatus = (p["status"] || "").toUpperCase();

  if (postStatus === "FAILED" || postStatus === "CANCELLED") {
    if (tranId) {
      const st = postStatus === "CANCELLED" ? "cancelled" : "failed";
      await Payment.updateOne({ tranId, status: "pending" }, { $set: { status: st } }).catch(
        () => undefined,
      );
    }
    res.type("text/plain").send("OK");
    return;
  }

  if (postStatus === "VALID" && tranId && valId) {
    await tryCompletePayment(tranId, valId);
  }

  res.type("text/plain").send("OK");
};
