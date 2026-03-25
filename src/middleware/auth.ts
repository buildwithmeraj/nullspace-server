import jwt from "jsonwebtoken";
import { NextFunction, Request, Response } from "express";

export const protect = (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(" ")[1]; // Bearer <token>

  // If no token found then, return 401
  if (!token) return res.status(401).json({ message: "Unauthorized" });

	  try {
	    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
	      id: string;
	    };
	    // `req.user` is also used by passport; for JWT-protected routes we store
	    // a minimal user payload (user id) and keep typing local via casting.
	    (req as Request & { user?: { id: string } }).user = { id: decoded.id };
	    next();
	  } catch {
	    return res.status(401).json({ message: "Token expired or invalid" });
	  }
};
