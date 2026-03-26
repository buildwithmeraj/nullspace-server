import type { Types } from "mongoose";

export type FriendStatus = "pending" | "accepted";

// Friendship is modeled as a request/relationship record between two users.
// On "accepted", you can optionally also sync `User.alliances` for fast reads.
export interface IFriend {
  _id?: Types.ObjectId | string;
  requesterId: Types.ObjectId | string;
  recipientId: Types.ObjectId | string;
  status: FriendStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

