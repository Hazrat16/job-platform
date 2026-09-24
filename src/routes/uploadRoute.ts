import { Router } from "express";
import upload from "../middlewares/upload.js";
import { getUploadedFileUrl } from "../utils/upload.js";

const router = Router();

router.post("/image", upload.single("file"), (req, res) => {
  const url = getUploadedFileUrl(req.file);
  if (!url) return res.status(400).json({ error: "No file uploaded" });

  return res.status(200).json({
    message: "Upload successful",
    url,
  });
});

export default router;
