import express from "express";
import sendChatMessage from "./chat/chatController.js";
import authRoutes from "./routes/authRoutes.js";
import uploadRoute from "./routes/uploadRoute.js";
import { startServer } from "./startChatServer.js";

console.log("✅ app.ts loaded");

const app = express();

app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/upload", uploadRoute);
app.post("/api/chat", sendChatMessage);

app.get("/api/test", (req, res) => {
  res.json({
    message: " Test route is working!...... 🚀",
  });
});

// Remove this line since startChatServer.ts handles server startup
// startServer();

app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
);

export default app;
