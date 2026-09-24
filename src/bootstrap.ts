import { createServer } from "http";
import dns from "dns";
import mongoose from "mongoose";
import app, { stopBackgroundJobs } from "./app.js";
import { ChatConsumer } from "./chat/consumer.js";
import { closeRabbitMQ, connectRabbitMQ } from "./chat/rabbitMQ.js";
import { WebSocketService } from "./chat/websocketService.js";
import { closeRedis, getRedis } from "./config/redis.js";
import { captureException, flushSentry, initSentry } from "./config/sentry.js";
import { logError, logInfo } from "./utils/logger.js";

const PORT = process.env["PORT"] || 5000;
const SHUTDOWN_TIMEOUT_MS = 10_000;

/** Fail fast on boot for config that has no safe fallback (better than a confusing 500 on first request). */
function assertRequiredEnv(): void {
  if (!process.env["JWT_SECRET"]) {
    logError("startup_failed", {
      reason: "JWT_SECRET is required but not set",
    });
    console.error(
      "❌ JWT_SECRET is required but not set. Set it in your .env before starting the server.",
    );
    process.exit(1);
  }
}

function installProcessErrorHandlers(): void {
  process.on("uncaughtException", (err) => {
    logError("uncaught_exception", { error: String(err), stack: (err as Error)?.stack });
    captureException(err);
    flushSentry()
      .catch(() => undefined)
      .finally(() => process.exit(1));
  });

  process.on("unhandledRejection", (reason) => {
    logError("unhandled_rejection", { reason: String(reason) });
    captureException(reason);
  });
}

export const startServer = async () => {
  assertRequiredEnv();
  initSentry();
  installProcessErrorHandlers();

  let mongoConnected = false;
  let chatStackEnabled = false;
  let wsService: WebSocketService | null = null;

  try {
    console.log("🚀 Starting advanced chat server...");

    // Kick off the Redis connection attempt now (rather than on first cache/rate-limit
    // use) so health checks reflect real state quickly and early requests aren't slowed
    // by a cold connect. Fully optional: cache/rate-limit fall back to in-process state.
    getRedis();

    const MONGODB_URI =
      process.env["MONGODB_URI"] ||
      process.env["MONGO_URI"] ||
      "mongodb://localhost:27018/job-platform";

    if (MONGODB_URI.startsWith("mongodb+srv://")) {
      // Public resolvers are often more reliable for SRV records in local dev.
      dns.setServers(["8.8.8.8", "1.1.1.1"]);
    }

    console.log("🔄 Connecting to MongoDB...");
    try {
      await mongoose.connect(MONGODB_URI);
      mongoConnected = true;
      console.log("✅ MongoDB connected");
    } catch (mongoError) {
      console.error("⚠️ MongoDB connection failed, starting in degraded mode:");
      console.error(mongoError);
    }

    const httpServer = createServer(app);

    if (mongoConnected) {
      try {
        wsService = new WebSocketService(httpServer);
        console.log("✅ WebSocket service initialized");

        await connectRabbitMQ();
        console.log("✅ RabbitMQ connected");

        await ChatConsumer.startConsuming();
        console.log("✅ Chat consumers started");
        chatStackEnabled = true;
      } catch (chatError) {
        console.error(
          "⚠️ Chat stack (RabbitMQ/WebSocket/consumer) failed; REST API will still run:",
        );
        console.error(chatError);
      }
    } else {
      console.log("⚠️ Chat services are disabled until MongoDB is reachable");
    }

    const host = process.env["HOST"] || "0.0.0.0";

    httpServer.listen(Number(PORT), host, () => {
      console.log(
        `🚀 API server running on http://${host === "0.0.0.0" ? "localhost" : host}:${PORT}`,
      );
      if (chatStackEnabled) {
        console.log(`🔌 WebSocket server ready for connections`);
        console.log(`📡 RabbitMQ consumers active`);
      } else if (mongoConnected) {
        console.log(
          `⚠️ MongoDB OK but chat stack offline (start RabbitMQ or set RABBITMQ_URL)`,
        );
      } else {
        console.log(`⚠️ Running in degraded mode (no database/chat)`);
      }
    });

    let shuttingDown = false;
    const shutdown = async (signal: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`🛑 Received ${signal}, shutting down gracefully...`);

      const forceExitTimer = setTimeout(() => {
        logError("shutdown_timed_out", { signal });
        console.error("❌ Graceful shutdown timed out, forcing exit");
        process.exit(1);
      }, SHUTDOWN_TIMEOUT_MS);
      forceExitTimer.unref();

      try {
        stopBackgroundJobs();

        await new Promise<void>((resolve, reject) => {
          httpServer.close((err) => (err ? reject(err) : resolve()));
        });
        console.log("✅ HTTP server closed");

        if (wsService) {
          await wsService.close();
          console.log("✅ WebSocket server closed");
        }

        await closeRabbitMQ();
        await closeRedis();

        if (mongoose.connection.readyState !== 0) {
          await mongoose.connection.close();
          console.log("✅ MongoDB connection closed");
        }

        await flushSentry();

        clearTimeout(forceExitTimer);
        logInfo("shutdown_complete", { signal });
        process.exit(0);
      } catch (err) {
        clearTimeout(forceExitTimer);
        logError("shutdown_failed", { signal, error: String(err) });
        console.error("❌ Error during graceful shutdown:", err);
        process.exit(1);
      }
    };

    process.on("SIGTERM", () => void shutdown("SIGTERM"));
    process.on("SIGINT", () => void shutdown("SIGINT"));
  } catch (err) {
    console.error("❌ Failed to start advanced chat server:", err);
    process.exit(1);
  }
};
