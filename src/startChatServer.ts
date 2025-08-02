// src/startServer.ts
import app from "./app"; // or wherever your Express app is defined
import { connectRabbitMQ } from "./chat/rabbitMQ";

const PORT = process.env["PORT"];

export const startServer = async () => {
  try {
    await connectRabbitMQ();
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1); // optional: exit the process if startup fails
  }
};
