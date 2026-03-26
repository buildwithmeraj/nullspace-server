import { Schema } from "mongoose";
import config from "../config";
import { getDbModel } from "./db";
import type { IReaction } from "../types/reaction.interface";

const reactionSchema = new Schema<IReaction>(
  {
    postId: { type: Schema.Types.ObjectId, required: true, unique: true },
    // Users who "loved" this post.
    userIds: [{ type: Schema.Types.ObjectId, ref: "User", default: [] }],
  },
  {
    timestamps: false,
    collection: "reactions",
  },
);

reactionSchema.index({ postId: 1 }, { unique: true });
reactionSchema.index({ userIds: 1 });

export function getReactionModel(dbName?: string) {
  return getDbModel<IReaction>(
    "Reaction",
    reactionSchema,
    dbName || config.posts_db_name || config.database_name,
  );
}

export const Reaction = getReactionModel();

