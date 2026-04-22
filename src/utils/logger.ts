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
