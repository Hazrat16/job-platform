type LogLevel = "info" | "warn" | "error";

type LogPayload = {
  level: LogLevel;
  message: string;
  timestamp: string;
  requestId?: string;
  [key: string]: unknown;
};

function write(payload: LogPayload) {
  const serialized = JSON.stringify(payload);
  if (payload.level === "error") {
    console.error(serialized);
    return;
  }
  if (payload.level === "warn") {
    console.warn(serialized);
    return;
  }
  console.log(serialized);
}

export function logInfo(message: string, meta?: Record<string, unknown>) {
  write({
    level: "info",
    message,
    timestamp: new Date().toISOString(),
    ...(meta ?? {}),
  });
}

export function logWarn(message: string, meta?: Record<string, unknown>) {
  write({
    level: "warn",
    message,
    timestamp: new Date().toISOString(),
    ...(meta ?? {}),
  });
}

export function logError(message: string, meta?: Record<string, unknown>) {
  write({
    level: "error",
    message,
    timestamp: new Date().toISOString(),
    ...(meta ?? {}),
  });
}

const lastLoggedAt = new Map<string, number>();

/**
 * Logs at most once per `intervalMs` for a given `key` — for warnings that fire on
 * every retry of a background reconnect loop (Redis/RabbitMQ down for minutes),
 * where logging every attempt would flood the log with an identical line forever.
 * The retry itself still runs on its normal schedule; only the logging is throttled.
 */
export function logWarnThrottled(
  key: string,
  intervalMs: number,
  message: string,
  meta?: Record<string, unknown>,
) {
  const now = Date.now();
  const last = lastLoggedAt.get(key) ?? 0;
  if (now - last < intervalMs) return;
  lastLoggedAt.set(key, now);
  logWarn(message, meta);
}

/** Call when a throttled condition clears (e.g. reconnected), so the next new
 * outage logs immediately instead of waiting out a stale throttle window. */
export function resetLogThrottle(key: string) {
  lastLoggedAt.delete(key);
}
