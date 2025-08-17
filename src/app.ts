import express from "express";
import authRoutes from "./routes/authRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import uploadRoute from "./routes/uploadRoute.js";
console.log("✅ app.ts loaded");

const app = express();

app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/upload", uploadRoute);
app.use("/api/chat", chatRoutes);

app.get("/api/test", (req, res) => {
  res.json({
    message: " Test route is working!...... 🚀",
  });
});

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
