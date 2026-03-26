import type { Types } from "mongoose";

// Love-only reactions stored per post. We keep a single document per post and
// store the set of users who reacted in `userIds`.
export interface IReaction {
  _id?: Types.ObjectId | string;
  postId: Types.ObjectId | string;
  userIds: (Types.ObjectId | string)[];
}

