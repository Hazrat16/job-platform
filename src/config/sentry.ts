import * as Sentry from "@sentry/node";
import { logInfo } from "../utils/logger.js";

let initialized = false;

/**
 * Error tracking, fully opt-in. No-op unless SENTRY_DSN is set, so this is
 * safe to call unconditionally at boot without requiring any setup.
 */
export function initSentry(): void {
  const dsn = process.env["SENTRY_DSN"];
  if (!dsn || initialized) return;

  Sentry.init({
    dsn,
    environment: process.env["NODE_ENV"] || "development",
    tracesSampleRate: 0.1,
  });
  initialized = true;
  logInfo("sentry_initialized");
}

export function captureException(err: unknown): void {
  if (!initialized) return;
  Sentry.captureException(err);
}

export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!initialized) return;
  await Sentry.flush(timeoutMs);
}
