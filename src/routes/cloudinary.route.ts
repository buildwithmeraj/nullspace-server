import express from "express";
import multer from "multer";
import { cloudinaryControllers } from "../controllers/cloudinary.controller";

const router = express.Router();

const upload = multer({
  // Store files in memory; controller streams buffers to Cloudinary.
  storage: multer.memoryStorage(),
  // Cloudinary max file size depends on account; keep a sensible API limit.
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// `image` (single) and `images` (multiple) are the expected multipart field names.
router.post("/upload", upload.single("image"), cloudinaryControllers.uploadImage);
router.post(
  "/uploads",
  upload.array("images", 10),
  cloudinaryControllers.uploadImages,
);

export const CloudinaryRoutes = router;
