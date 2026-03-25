export {};

declare global {
  namespace Express {
    interface User {
      _id?: import("mongoose").Types.ObjectId | string;
      email?: string;
      role?: "admin" | "user";
    }
  }
}
