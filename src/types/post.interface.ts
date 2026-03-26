import type { Types } from "mongoose";

// Minimal image metadata stored on a post. This mirrors the Cloudinary upload output
// (url + optional publicId + dimensions).
export interface IPostImage {
  publicId?: string;
  url: string;
  width?: number;
  height?: number;
}

export interface IPost {
  _id?: Types.ObjectId | string;
  // Owner of the post. Used for authorization (owner-only mutations unless admin).
  userId: Types.ObjectId | string;
  content: string;
  images: IPostImage[]; // max 5
  createdAt?: Date;
  updatedAt?: Date;
}
