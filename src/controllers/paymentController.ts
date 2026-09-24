import { Request, Response } from "express";
import * as paymentService from "../services/paymentService.js";
import { fail, ok } from "../utils/http.js";

type JwtUser = { id: string; role: string };

function redirectFrontend(res: Response, params: Record<string, string>) {
  const { frontendUrl } = paymentService.getSslConfig();
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

export const initSslCommerz = async (req: Request, res: Response) => {
  const jwtUser = (req as Request & { user: JwtUser }).user;
  if (!jwtUser || jwtUser.role !== "employer") {
    return fail(res, 403, "FORBIDDEN", "Only employers can start a payment");
  }

  const body = req.body as {
    amount?: unknown;
    purpose?: unknown;
    jobId?: unknown;
    boostDays?: unknown;
  };
  const result = await paymentService.initPayment({ userId: jwtUser.id, ...body });
  return ok(res, result, "Redirect customer to gatewayUrl");
};

export const listMyPayments = async (req: Request, res: Response) => {
  const jwtUser = (req as Request & { user: JwtUser }).user;
  if (!jwtUser) {
    return fail(res, 401, "UNAUTHORIZED", "Unauthorized");
  }
  const rows = await paymentService.listMyPayments(jwtUser.id);
  return ok(res, rows, "Payments fetched");
};

export const sslCallbackSuccess = async (req: Request, res: Response) => {
  const p = mergeForm(req);
  const tranId = p["tran_id"] || "";
  const valId = p["val_id"];

  const result = await paymentService.completePaymentFromCallback(tranId, valId);
  if (!result.ok) {
    await paymentService.markPaymentTerminal(tranId, "failed");
    return redirectFrontend(res, { ssl: "fail", reason: "validation" });
  }

  return redirectFrontend(res, { ssl: "success", tran_id: tranId });
};

export const sslCallbackFail = async (req: Request, res: Response) => {
  const p = mergeForm(req);
  const tranId = p["tran_id"] || "";
  await paymentService.markPaymentTerminal(tranId, "failed");
  return redirectFrontend(res, { ssl: "fail", tran_id: tranId });
};

export const sslCallbackCancel = async (req: Request, res: Response) => {
  const p = mergeForm(req);
  const tranId = p["tran_id"] || "";
  await paymentService.markPaymentTerminal(tranId, "cancelled");
  return redirectFrontend(res, { ssl: "cancel", tran_id: tranId });
};

export const sslIpn = async (req: Request, res: Response) => {
  const p = mergeForm(req);
  const tranId = p["tran_id"] || "";
  const valId = p["val_id"];
  const postStatus = (p["status"] || "").toUpperCase();

  if (postStatus === "FAILED" || postStatus === "CANCELLED") {
    await paymentService.markPaymentTerminal(
      tranId,
      postStatus === "CANCELLED" ? "cancelled" : "failed",
    );
    res.type("text/plain").send("OK");
    return;
  }

  if (postStatus === "VALID" && tranId && valId) {
    await paymentService.completePaymentFromCallback(tranId, valId);
  }

  res.type("text/plain").send("OK");
};
