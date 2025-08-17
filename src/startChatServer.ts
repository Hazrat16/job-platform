import { createServer } from "http";
import app from "./app.js";
import { connectRabbitMQ } from "./chat/rabbitMQ.js";
import { ChatConsumer } from "./chat/consumer.js";
import { WebSocketService } from "./chat/websocketService.js";

const PORT = process.env.PORT || 5000;

export const startServer = async () => {
  try {
    console.log("🚀 Starting advanced chat server...");
    
    // Create HTTP server
    const httpServer = createServer(app);
    
    // Initialize WebSocket service
    const webSocketService = new WebSocketService(httpServer);
    console.log("✅ WebSocket service initialized");
    
    // Connect to RabbitMQ
    await connectRabbitMQ();
    console.log("✅ RabbitMQ connected");
    
    // Start consuming messages
    await ChatConsumer.startConsuming();
    console.log("✅ Chat consumers started");
    
    // Start HTTP server
    httpServer.listen(PORT, () => {
      console.log(`🚀 Advanced Chat Server running on http://localhost:${PORT}`);
      console.log(`🔌 WebSocket server ready for connections`);
      console.log(`📡 RabbitMQ consumers active`);
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
