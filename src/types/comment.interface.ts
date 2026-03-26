import type { Types } from "mongoose";

export interface IComment {
  _id?: Types.ObjectId | string;
  postId: Types.ObjectId | string;
  userId: Types.ObjectId | string;
  content: string;
  createdAt?: Date;
  updatedAt?: Date;
}

