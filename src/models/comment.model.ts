import { Schema } from "mongoose";
import config from "../config";
import { getDbModel } from "./db";
import type { IComment } from "../types/comment.interface";

const COMMENT_CONTENT_MAX_CHARS = 1_000;

const commentSchema = new Schema<IComment>(
  {
    // The post this comment belongs to.
    postId: { type: Schema.Types.ObjectId, required: true, index: true },
    // The author/owner of the comment (used for owner-only mutations unless admin).
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: COMMENT_CONTENT_MAX_CHARS,
    },
  },
  {
    // Adds `createdAt` and `updatedAt`.
    timestamps: true,
    collection: "comments",
  },
);

commentSchema.index({ postId: 1, createdAt: -1 });
commentSchema.index({ userId: 1, createdAt: -1 });

export function getCommentModel(dbName?: string) {
  return getDbModel<IComment>(
    "Comment",
    commentSchema,
    dbName || config.posts_db_name || config.database_name,
  );
}

export const Comment = getCommentModel();
