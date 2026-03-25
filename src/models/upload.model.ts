import { Schema } from "mongoose";
import config from "../config";
import type { IUpload } from "../types/upload.interface";
import { getDbModel } from "./db";

// Minimal upload metadata persisted after a successful Cloudinary upload.
const uploadSchema = new Schema<IUpload>(
  {
    // Cloudinary unique identifier for the asset (used to manage/delete later).
    publicId: { type: String, required: true, index: true },
    // Public HTTPS URL used by clients to display the image.
    url: { type: String, required: true },
    width: { type: Number, required: false },
    height: { type: Number, required: false },
  },
  {
    timestamps: true,
    collection: "uploads",
  },
);

export function getUploadModel(dbName?: string) {
  return getDbModel<IUpload>(
    "Upload",
    uploadSchema,
    dbName || config.database_name,
  );
}

export const Upload = getUploadModel();
