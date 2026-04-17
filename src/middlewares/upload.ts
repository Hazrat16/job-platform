import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const isImage = file.mimetype.startsWith("image/");

    if (isImage) {
      return {
        folder: "job-platform/images",
        allowed_formats: ["jpg", "png", "jpeg", "webp"],
        transformation: [{ width: 500, height: 500, crop: "limit" }],
      };
    }

    return {
      folder: "job-platform/resumes",
      resource_type: "raw",
      allowed_formats: ["pdf", "doc", "docx"],
    };
  },
});

const upload = multer({ storage });

export default upload;
