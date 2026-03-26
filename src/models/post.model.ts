import { Schema } from "mongoose";
import config from "../config";
import { getDbModel } from "./db";
import type { IPost, IPostImage } from "../types/post.interface";

const POST_CONTENT_MAX_CHARS = 10_000;

function imagesLimit(images: IPostImage[]) {
  return images.length <= 5;
}

// Embedded schema so `images` are stored as objects, not separate collections.
const postImageSchema = new Schema<IPostImage>(
  {
    publicId: { type: String, required: false },
    url: { type: String, required: true },
    width: { type: Number, required: false },
    height: { type: Number, required: false },
  },
  { _id: false },
);

const postSchema = new Schema<IPost>(
  {
    // Owner reference. We keep it simple and validate permissions in controllers.
    userId: { type: Schema.Types.ObjectId, required: true },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: POST_CONTENT_MAX_CHARS,
    },
    images: {
      type: [postImageSchema],
      default: [],
      // Hard limit to keep payload sizes reasonable.
      validate: [imagesLimit, "images exceeds the limit of 5"],
    },
  },
  {
    timestamps: true, // adds createdAt/updatedAt
    collection: "posts",
  },
);

export function getPostModel(dbName?: string) {
  return getDbModel<IPost>(
    "Post",
    postSchema,
    dbName || config.posts_db_name || config.database_name,
  );
}

export const Post = getPostModel();
