import type { Types } from "mongoose";

// Shape of the upload document stored in MongoDB after a Cloudinary upload.
export interface IUpload {
  _id?: Types.ObjectId | string;
  publicId: string;
  url: string;
  width?: number;
  height?: number;
  createdAt?: Date;
  updatedAt?: Date;
}
