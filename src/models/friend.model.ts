import { Schema } from "mongoose";
import config from "../config";
import { getDbModel } from "./db";
import type { IFriend } from "../types/friend.interface";

const friendSchema = new Schema<IFriend>(
  {
    requesterId: { type: Schema.Types.ObjectId, required: true, index: true },
    recipientId: { type: Schema.Types.ObjectId, required: true, index: true },
    status: { type: String, enum: ["pending", "accepted"], default: "pending" },
  },
  {
    timestamps: true,
    collection: "friends",
  },
);

// Prevent duplicate requests in the same direction.
friendSchema.index({ requesterId: 1, recipientId: 1 }, { unique: true });

export function getFriendModel(dbName?: string) {
  return getDbModel<IFriend>(
    "Friend",
    friendSchema,
    dbName || config.users_db_name || config.database_name,
  );
}

export const Friend = getFriendModel();

