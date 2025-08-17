// src/startChatServer.ts
import app from "./app.js"; // or wherever your Express app is defined
import { connectRabbitMQ } from "./chat/rabbitMQ.js";

const PORT = process.env["PORT"];

export const startServer = async () => {
  try {
    // Try to connect to RabbitMQ, but don't fail if it's not available
    try {
      await connectRabbitMQ();
    } catch (error) {
      console.log("⚠️  RabbitMQ not available, continuing without it...");
    }
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1); // optional: exit the process if startup fails
  }
};
