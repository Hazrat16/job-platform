import express from "express";
import applicationRoutes from "./routes/applicationRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import savedJobRoutes from "./routes/savedJobRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";
import resumeFitRoutes from "./routes/resumeFitRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import jobRoutes from "./routes/jobRoutes.js";
import uploadRoute from "./routes/uploadRoute.js";
import adminRoutes from "./routes/adminRoutes.js";
import externalJobRoutes from "./routes/externalJobRoutes.js";
import remoteJobRoutes from "./routes/remoteJobRoutes.js";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler.js";
import { requestContext } from "./middlewares/requestContext.js";
import {
  queueJobClosingSoonNotifications,
  startNotificationWorker,
} from "./services/notificationService.js";
import mongoose from "mongoose";
import { logError, logInfo } from "./utils/logger.js";
import { snapshotMetrics, trackHttp } from "./utils/metrics.js";
logInfo("app.ts loaded");

const app = express();
app.use(requestContext);
startNotificationWorker();
void queueJobClosingSoonNotifications();
setInterval(() => {
  void queueJobClosingSoonNotifications();
}, 6 * 60 * 60 * 1000);

app.use((req, res, next) => {
  const startedAt = Date.now();
  const originalEnd = res.end.bind(res);
  res.end = ((...args: Parameters<typeof res.end>) => {
    const latencyMs = Date.now() - startedAt;
    if (!res.headersSent) {
      res.setHeader("Server-Timing", `app;dur=${latencyMs}`);
      res.setHeader("X-Response-Time", `${latencyMs}ms`);
    }
    return originalEnd(...args);
  }) as typeof res.end;
  res.on("finish", () => {
    const latencyMs = Date.now() - startedAt;
    trackHttp(res.statusCode, latencyMs);
    logInfo("http_request", {
      requestId: res.locals["requestId"] as string | undefined,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      latencyMs,
    });
  });

  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With",
  );
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/upload", uploadRoute);
app.use("/api/chat", chatRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/saved-jobs", savedJobRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/resume-fit", resumeFitRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/external-jobs", externalJobRoutes);
app.use("/api/remote-jobs", remoteJobRoutes);

app.get("/api/test", (req, res) => {
  res.json({
    message: " Test route is working!...... 🚀",
  });
});

app.get("/api/health", (_req, res) => {
  const dbConnected = mongoose.connection.readyState === 1;
  const status = dbConnected ? "ok" : "degraded";
  res.status(dbConnected ? 200 : 503).json({
    success: dbConnected,
    status,
    services: {
      api: "up",
      db: dbConnected ? "up" : "down",
    },
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/health/ready", (_req, res) => {
  const ready = mongoose.connection.readyState === 1;
  if (!ready) {
    return res.status(503).json({
      success: false,
      status: "not_ready",
      reason: "Database not connected",
    });
  }
  return res.json({ success: true, status: "ready" });
});

app.get("/api/metrics", (_req, res) => {
  try {
    return res.json({
      success: true,
      message: "Metrics snapshot",
      data: snapshotMetrics(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logError("metrics_snapshot_failed", { error });
    return res.status(500).json({
      success: false,
      message: "Could not collect metrics",
    });
  }
});
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
