import type { Request, Response } from "express";
import { v2 as cloudinary } from "cloudinary";
import type {
  UploadApiErrorResponse,
  UploadApiOptions,
  UploadApiResponse,
} from "cloudinary";
import config from "../config";
import { Upload } from "../models/upload.model";

function assertCloudinaryConfigured() {
  // Configure Cloudinary lazily at request-time so the app can boot even if
  // Cloudinary env vars are missing in environments that don't use uploads.
  const cloudName =
    config.cloudinary_cloud_name ?? process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = config.cloudinary_api_key ?? process.env.CLOUDINARY_API_KEY;
  const apiSecret = config.cloudinary_secret ?? process.env.CLOUDINARY_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "Cloudinary is not configured (CLOUDINARY_CLOUD_NAME/CLOUDINARY_API_KEY/CLOUDINARY_SECRET)",
    );
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });
}

function uploadBuffer(
  fileBuffer: Buffer,
  options: UploadApiOptions,
): Promise<UploadApiResponse> {
  // Use streaming upload for multipart/form-data buffers so we don't write temp
  // files to disk.
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      options,
      (error?: UploadApiErrorResponse, result?: UploadApiResponse) => {
        if (error) return reject(error);
        if (!result) {
          return reject(new Error("Cloudinary upload returned no result"));
        }
        resolve(result);
      },
    );
    stream.end(fileBuffer);
  });
}

// Keep the persisted document intentionally small (only what we need later).
function toUploadDocPayload(result: UploadApiResponse) {
  return {
    publicId: result.public_id,
    // Prefer HTTPS; store it as `url` to keep the persisted shape minimal.
    url: result.secure_url || result.url,
    width: result.width,
    height: result.height,
  };
}

export const cloudinaryControllers = {
  // POST /api/v1/cloudinary/upload
  uploadImage: async (req: Request, res: Response) => {
    try {
      assertCloudinaryConfigured();

      const folder = String(req.body?.folder ?? "uploads");

      let uploadResult: UploadApiResponse | null = null;

      const file = (req as any).file as
        | { buffer: Buffer; originalname?: string }
        | undefined;

      if (file?.buffer) {
        uploadResult = await uploadBuffer(file.buffer, {
          folder,
          resource_type: "image",
        });
      } else if (typeof req.body?.image === "string" && req.body.image.trim()) {
        const image = req.body.image.trim();
        uploadResult = await cloudinary.uploader.upload(image, {
          folder,
          resource_type: "image",
        });
      } else {
        return res.status(400).json({
          success: false,
          message:
            "No image provided. Send multipart/form-data field `image` or JSON body `{ image: string }`.",
        });
      }

      const created = await Upload.create(toUploadDocPayload(uploadResult));

      return res.status(201).json({
        success: true,
        message: "Image uploaded successfully",
        data: created,
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to upload image",
        error: err?.message ?? String(err),
      });
    }
  },

  // POST /api/v1/cloudinary/uploads
  uploadImages: async (req: Request, res: Response) => {
    try {
      assertCloudinaryConfigured();

      const folder = String(req.body?.folder ?? "uploads");

      const files = (req as any).files as
        | Array<{ buffer: Buffer; originalname?: string }>
        | undefined;

      const bodyImages = Array.isArray(req.body?.images)
        ? (req.body.images as unknown[]).filter(
            (x): x is string => typeof x === "string",
          )
        : [];

      if ((!files || files.length === 0) && bodyImages.length === 0) {
        return res.status(400).json({
          success: false,
          message:
            "No images provided. Send multipart/form-data field `images` or JSON body `{ images: string[] }`.",
        });
      }

      const uploadResults: Array<{ result: UploadApiResponse }> = [];

      if (files?.length) {
        const results = await Promise.all(
          files.map(async (f) => ({
            result: await uploadBuffer(f.buffer, {
              folder,
              resource_type: "image",
            }),
          })),
        );
        uploadResults.push(...results);
      }

      if (bodyImages.length) {
        const results = await Promise.all(
          bodyImages.map(async (image) => ({
            result: await cloudinary.uploader.upload(image.trim(), {
              folder,
              resource_type: "image",
            }),
          })),
        );
        uploadResults.push(...results.map((r) => ({ result: r.result })));
      }

      const created = await Upload.insertMany(
        uploadResults.map(({ result }) => toUploadDocPayload(result)),
      );

      return res.status(201).json({
        success: true,
        message: "Images uploaded successfully",
        data: created,
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to upload images",
        error: err?.message ?? String(err),
      });
    }
  },
};
