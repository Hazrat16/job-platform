import express from "express";
import authRoutes from "./routes/authRoutes.js";

console.log("✅ app.ts loaded");

const app = express();

app.use(express.json());
app.use("/api/auth", authRoutes);

// Error handler
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
