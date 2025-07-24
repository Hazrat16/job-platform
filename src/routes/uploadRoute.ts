import { Router } from "express";
import upload from "../middlewares/upload";

function asyncHandler(fn: any) {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

const router = Router();

router.post("/image", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  return res.status(200).json({
    message: "Upload successful",
    url: (req.file as any).path,
  });
});

export default router;
