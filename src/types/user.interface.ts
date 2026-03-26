import type { Types } from "mongoose";

export interface IUser {
  name: string;
  _id?: Types.ObjectId | string;
  username?: string;
  email: string;
  password?: string;
  image: string;
  bio?: string;
  role: "admin" | "user";
  googleId?: string;
  avatar?: string;
  authProvider?: "local" | "google";
  refreshToken?: string | null;
  // Friend/user connections. Stores referenced user ids.
  friends?: (Types.ObjectId | string)[];
}
