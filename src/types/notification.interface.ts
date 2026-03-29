import type { Types } from "mongoose";

export type NotificationType =
  | "alliance_request"
  | "alliance_accepted"
  | "comment"
  | "reaction";

export interface INotification {
  _id?: Types.ObjectId | string;
  userId: Types.ObjectId | string; // recipient
  type: NotificationType;
  message: string;
  data?: Record<string, unknown>;
  read: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

