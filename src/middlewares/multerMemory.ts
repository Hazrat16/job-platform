import multer from "multer";

/** In-memory uploads for one-off AI processing (not stored on Cloudinary). */
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const okMime =
      file.mimetype === "application/pdf" ||
      file.mimetype === "text/plain" ||
      file.mimetype === "application/octet-stream";
    const name = (file.originalname || "").toLowerCase();
    const okName = name.endsWith(".pdf") || name.endsWith(".txt");
    if (okMime || okName) {
      cb(null, true);
      return;
    }
    cb(new Error("Only PDF or TXT files are allowed for CV upload"));
  },
});

export default memoryUpload;
