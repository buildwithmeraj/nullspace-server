import jwt from "jsonwebtoken";
import { NextFunction, Request, Response } from "express";
import { User } from "../models/user.model";

export const protect = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const token = req.headers.authorization?.split(" ")[1]; // Bearer <token>

  // If no token found then, return 401
  if (!token) return res.status(401).json({ message: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string };

    // Load role/email so we can enforce owner/admin permissions in controllers.
    const user = await User.findById(decoded.id).select("email role");
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    // `req.user` is also used by passport; keep a minimal payload.
    (req as Request & { user?: Express.User }).user = {
      _id: user._id,
      email: user.email,
      role: user.role,
    };
    return next();
  } catch {
    return res.status(401).json({ message: "Token expired or invalid" });
  }
};
