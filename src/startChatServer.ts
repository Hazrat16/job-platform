import dotenv from "dotenv";
dotenv.config();

import { createServer } from "http";
import dns from "dns";
import mongoose from "mongoose";
import app from "./app.js";
import { ChatConsumer } from "./chat/consumer.js";
import { connectRabbitMQ } from "./chat/rabbitMQ.js";
import { WebSocketService } from "./chat/websocketService.js";

const PORT = process.env["PORT"] || 5000;

export const startServer = async () => {
  let mongoConnected = false;
  let chatStackEnabled = false;
  try {
    console.log("🚀 Starting advanced chat server...");

    // Connect to MongoDB first
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

    // Create HTTP server
    const httpServer = createServer(app);

    if (mongoConnected) {
      try {
        new WebSocketService(httpServer);
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

    // Start HTTP server (0.0.0.0 so WSL/Docker/LAN can reach it)
    httpServer.listen(Number(PORT), host, () => {
      console.log(
        `🚀 API server running on http://${host === "0.0.0.0" ? "localhost" : host}:${PORT}`
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

    // Graceful shutdown
    process.on("SIGTERM", async () => {
      console.log("🛑 Received SIGTERM, shutting down gracefully...");
      httpServer.close(() => {
        console.log("✅ HTTP server closed");
        process.exit(0);
      });
    });

    process.on("SIGINT", async () => {
      console.log("🛑 Received SIGINT, shutting down gracefully...");
      httpServer.close(() => {
        console.log("✅ HTTP server closed");
        process.exit(0);
      });
    });
  } catch (err) {
    console.error("❌ Failed to start advanced chat server:", err);
    process.exit(1);
  }
};

// Start the server when this file is run directly
startServer();
