import mongoose from "mongoose";
import Job from "../models/jobModel.js";
import Payment, { type PaymentStatus } from "../models/paymentModel.js";
import User from "../models/userModel.js";
import {
  initiateHostedCheckout,
  validateTransactionByValId,
} from "./sslcommerzService.js";
import { HttpError } from "../utils/http.js";
import { logError } from "../utils/logger.js";

/** Server-controlled pricing — never trust a client-supplied amount for a paid feature. */
const JOB_BOOST_PRICE_PER_DAY_BDT = 100;
const JOB_BOOST_MIN_DAYS = 1;
const JOB_BOOST_MAX_DAYS = 30;

export function getSslConfig(): {
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
  const isSandbox = (process.env["SSLCOMMERZ_IS_SANDBOX"] || "true").toLowerCase() !== "false";
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
  return { storeId, storePassword, isSandbox, apiPublic, frontendUrl };
}

function parseAmount(v: string | number | undefined): number | null {
  if (v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export type InitPaymentInput = {
  userId: string;
  purpose?: unknown;
  amount?: unknown;
  jobId?: unknown;
  boostDays?: unknown;
};

export async function initPayment(
  input: InitPaymentInput,
): Promise<{ gatewayUrl: string; tranId: string }> {
  const { storeId, storePassword, isSandbox, apiPublic } = getSslConfig();
  if (!storeId || !storePassword) {
    throw new HttpError(
      503,
      "SERVICE_UNAVAILABLE",
      "SSLCOMMERZ store credentials missing. Set SSLCOMMERZ_STORE_ID and SSLCOMMERZ_STORE_PASSWORD in the API .env (from https://developer.sslcommerz.com for your sandbox store). For local sandbox only, you may set SSLCOMMERZ_ALLOW_TESTBOX=true to use the public sandbox pair testbox / qwerty from SSLCOMMERZ docs.",
    );
  }

  const purpose = input.purpose === "job_boost" ? "job_boost" : "wallet_topup";
  let amount: number;
  let jobId: mongoose.Types.ObjectId | undefined;
  let boostDays: number | undefined;
  let productName = "Job platform wallet top-up";

  if (purpose === "job_boost") {
    const jobIdRaw = String(input.jobId || "");
    if (!mongoose.Types.ObjectId.isValid(jobIdRaw)) {
      throw new HttpError(400, "BAD_REQUEST", "A valid jobId is required");
    }
    boostDays = Math.trunc(Number(input.boostDays));
    if (
      !Number.isFinite(boostDays) ||
      boostDays < JOB_BOOST_MIN_DAYS ||
      boostDays > JOB_BOOST_MAX_DAYS
    ) {
      throw new HttpError(
        400,
        "BAD_REQUEST",
        `boostDays must be between ${JOB_BOOST_MIN_DAYS} and ${JOB_BOOST_MAX_DAYS}`,
      );
    }

    const job = await Job.findOne({ _id: jobIdRaw, deletedAt: { $exists: false } });
    if (!job) {
      throw new HttpError(404, "NOT_FOUND", "Job not found");
    }
    if (job.employer.toString() !== input.userId) {
      throw new HttpError(403, "FORBIDDEN", "You don't own this job");
    }

    jobId = job._id as mongoose.Types.ObjectId;
    // Amount is always computed server-side from boostDays — never trust a client-supplied amount.
    amount = boostDays * JOB_BOOST_PRICE_PER_DAY_BDT;
    productName = `Featured job boost (${boostDays} day${boostDays === 1 ? "" : "s"}) — ${job.title}`;
  } else {
    const parsed = parseAmount(input.amount as string | number | undefined);
    if (parsed === null || parsed < 10 || parsed > 500_000) {
      throw new HttpError(400, "BAD_REQUEST", "Amount must be between 10 and 500000 BDT");
    }
    amount = parsed;
  }

  const user = await User.findById(input.userId).lean();
  if (!user) {
    throw new HttpError(404, "NOT_FOUND", "User not found");
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
    user: new mongoose.Types.ObjectId(input.userId),
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
    throw new HttpError(502, "INTERNAL_ERROR", session.message);
  }

  if (session.sessionKey) {
    await Payment.updateOne({ tranId }, { $set: { sessionKey: session.sessionKey } }).catch(
      () => undefined,
    );
  }

  return { gatewayUrl: session.gatewayUrl, tranId };
}

export async function listMyPayments(userId: string) {
  return Payment.find({ user: userId }).sort({ createdAt: -1 }).limit(50).lean();
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

export type CompletePaymentResult =
  | { ok: true; duplicate: boolean }
  | { ok: false; reason: string };

/**
 * Called from SSLCommerz's success callback/IPN. Never throws for expected failure
 * cases (missing val_id, payment not found, validation failure) — those are
 * legitimate outcomes the caller (a webhook-style controller) must turn into a
 * redirect or a plain "OK" ack, never a JSON error response.
 */
export async function completePaymentFromCallback(
  tranId: string,
  valId: string | undefined,
): Promise<CompletePaymentResult> {
  const { storeId, storePassword, isSandbox } = getSslConfig();
  if (!valId) {
    return { ok: false, reason: "missing_val_id" };
  }

  const payment = await Payment.findOne({ tranId });
  if (!payment) {
    return { ok: false, reason: "payment_not_found" };
  }
  if (payment.status === "completed") {
    return { ok: true, duplicate: true };
  }

  const validation = await validateTransactionByValId(valId, storeId, storePassword, isSandbox);
  if (!validation) {
    return { ok: false, reason: "validation_failed" };
  }

  const vStatus = String(validation.status || "");
  if (vStatus !== "VALID" && vStatus !== "VALIDATED") {
    return { ok: false, reason: "invalid_transaction_status" };
  }
  if (String(validation.tran_id || "") !== tranId) {
    return { ok: false, reason: "tran_id_mismatch" };
  }

  const amountSsl = parseAmount(validation.amount);
  if (amountSsl === null || Math.abs(amountSsl - payment.amount) > 0.05) {
    return { ok: false, reason: "amount_mismatch" };
  }

  const cur = String(validation.currency_type || "").toUpperCase();
  if (cur && cur !== payment.currency.toUpperCase()) {
    return { ok: false, reason: "currency_mismatch" };
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

  return { ok: true, duplicate: false };
}

export async function markPaymentTerminal(
  tranId: string,
  status: Extract<PaymentStatus, "failed" | "cancelled">,
): Promise<void> {
  if (!tranId) return;
  await Payment.updateOne({ tranId, status: "pending" }, { $set: { status } }).catch(() => undefined);
}
