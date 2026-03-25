import jwt from "jsonwebtoken";
import type { HydratedDocument } from "mongoose";
import { IUser } from "../types/user.interface";

export const generateTokens = async (user: HydratedDocument<IUser>) => {
  const userId = user._id.toString();
  const accessToken = jwt.sign({ id: userId }, process.env.JWT_SECRET!, {
    expiresIn: "15m",
  });
  const refreshToken = jwt.sign(
    { id: userId },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: "7d" },
  );

  // Persist refresh token on user
  user.refreshToken = refreshToken;
  await user.save();

  return { accessToken, refreshToken };
};
