import multer from "multer";
import cloudinaryStorage from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";

// multer-storage-cloudinary@2.2.1 runs `params` through `run-parallel`, which calls
// it as `(req, file, callback)` and waits for `callback` to be invoked — it does
// NOT await a returned promise. An `async (req, file) => {...}` function silently
// satisfies TypeScript but never calls that callback, so the upload hangs forever
// (discovered live: a resume upload never completed). It also expects
// `opts.cloudinary` to be the top-level `cloudinary` module (with a `.v2` property),
// not the `v2` namespace itself, since internally it calls `this.cloudinary.v2.uploader...`.
const storage = cloudinaryStorage({
  cloudinary: { v2: cloudinary },
  params: (req, file, callback) => {
    const isImage = file.mimetype.startsWith("image/");

    if (isImage) {
      callback(null, {
        folder: "job-platform/images",
        allowed_formats: ["jpg", "png", "jpeg", "webp"],
        transformation: [{ width: 500, height: 500, crop: "limit" }],
      });
      return;
    }

    callback(null, {
      folder: "job-platform/resumes",
      resource_type: "raw",
      allowed_formats: ["pdf", "doc", "docx"],
    });
  },
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

export default upload;
