import { Schema } from "mongoose";
import config from "../config";
import { getDbModel } from "./db";
import type { INotification } from "../types/notification.interface";

const notificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    type: {
      type: String,
      enum: ["alliance_request", "alliance_accepted", "comment", "reaction"],
      required: true,
      index: true,
    },
    message: { type: String, required: true, trim: true },
    data: { type: Schema.Types.Mixed, required: false, default: undefined },
    read: { type: Boolean, default: false, index: true },
  },
  {
    timestamps: true,
    collection: "notifications",
  },
);

notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

export function getNotificationModel(dbName?: string) {
  // Notifications are user-centric, so store them with user-related collections.
  return getDbModel<INotification>(
    "Notification",
    notificationSchema,
    dbName || config.users_db_name || config.database_name,
  );
}

export const Notification = getNotificationModel();

