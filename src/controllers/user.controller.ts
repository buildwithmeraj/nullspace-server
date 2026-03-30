import bcrypt from "bcrypt";
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import { User } from "../models/user.model";
import { generateTokens } from "../utilities/token";
import type { UpdateProfileInput } from "../types/user.interface";

const getCookie = (req: Request, name: string): string | undefined => {
  // Reads a single cookie value from the raw `Cookie` header.
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return;

  const parts = cookieHeader.split(";").map((p) => p.trim());
  for (const part of parts) {
    const eqIndex = part.indexOf("=");
    if (eqIndex === -1) continue;
    const key = decodeURIComponent(part.slice(0, eqIndex));
    if (key !== name) continue;
    return decodeURIComponent(part.slice(eqIndex + 1));
  }
};

// Register user
const register = async (req: Request, res: Response) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const email =
      typeof req.body?.email === "string" ? req.body.email.trim() : "";
    const password =
      typeof req.body?.password === "string" ? req.body.password : "";
    const image =
      typeof req.body?.image === "string" ? req.body.image.trim() : "";

    if (!name) {
      return res
        .status(400)
        .json({ success: false, message: "name is required" });
    }
    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: "email is required" });
    }
    if (!password || !password.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "password is required" });
    }
    if (password.trim().length < 6) {
      return res.status(400).json({
        success: false,
        message: "password must be at least 6 characters",
      });
    }
    if (!image) {
      return res
        .status(400)
        .json({ success: false, message: "image is required" });
    }

    // Check if user already exists
    const isUserExist = await User.findOne({ email });

    if (isUserExist) {
      return res.status(400).json({
        success: false,
        message: "User already exists!",
      });
    }

    // Allowlist only the expected local-registration fields.
    const savedUser = await User.create({
      name,
      email,
      password: password.trim(),
      image,
      authProvider: "local",
    });

    // Issue access token + refresh token (refresh token is also persisted on user for rotation/reuse detection).
    const { accessToken, refreshToken } = await generateTokens(
      savedUser as any,
    );

    // Store refresh token in an httpOnly cookie so it is not accessible to client-side JS.
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // Omit password from response
    const userResponse = savedUser.toObject() as any;
    delete userResponse.password;
    delete userResponse.refreshToken;

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: userResponse,
      token: accessToken,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: "Failed to register user",
      error: err.message,
    });
  }
};

// Login user
const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Check if user exists
    // Password is typically excluded in the User schema, so we explicitly include it here for verification.
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Provider mismatch: Google-only users can't log in with credentials.
    if ((user as any).authProvider === "google") {
      return res.status(400).json({
        success: false,
        message:
          "This account uses Google sign-in. Please continue with Google.",
        code: "AUTH_PROVIDER_MISMATCH",
      });
    }

    // Compare passwords
    if (!user.password || typeof user.password !== "string") {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }
    const isPasswordMatch = await bcrypt.compare(
      password,
      user.password as string,
    );
    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const { accessToken, refreshToken } = await generateTokens(user as any);

    // Store refresh token in an httpOnly cookie; access token is returned in the JSON response.
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // Omit password from response
    const userResponse = user.toObject() as any;
    delete userResponse.password;
    delete userResponse.refreshToken;

    res.status(200).json({
      success: true,
      message: "User logged in successfully",
      token: accessToken,
      data: userResponse,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: "Failed to login",
      error: err.message,
    });
  }
};

// Get a user
const getUser = async (req: Request, res: Response) => {
  try {
    const emailParam = req.params.email;
    const email = (
      Array.isArray(emailParam) ? emailParam[0] : (emailParam ?? "")
    ).trim();
    // Exclude internal/sensitive fields from the response payload.
    const user = await User.findOne({ email }).select(
      "-password -role -authProvider -refreshToken -createdAt -updatedAt -__v",
    );
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    res.status(200).json({
      success: true,
      message: "User fetched successfully",
      data: user,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch user",
      error: err.message,
    });
  }
};

// Get a user by username (public profile fields only).
const getUserByUsername = async (req: Request, res: Response) => {
  try {
    const usernameParam = req.params.username;
    const rawUsername = (
      Array.isArray(usernameParam) ? usernameParam[0] : (usernameParam ?? "")
    ).trim();
    const username = rawUsername.replace(/^@/, "");

    if (!username) {
      return res.status(400).json({
        success: false,
        message: "username is required",
      });
    }

    // Case-insensitive match so `/d/Foo` and `/d/foo` both work.
    const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const user = await User.findOne({
      username: { $regex: new RegExp(`^${escaped}$`, "i") },
    }).select("-password -role -authProvider -refreshToken -__v");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User fetched successfully",
      data: user,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch user",
      error: err.message,
    });
  }
};

// Search users for mentions/autocomplete (username required).
const searchUsers = async (req: Request, res: Response) => {
  try {
    const queryRaw = req.query.query as string | undefined;
    const query = (queryRaw ?? "").trim().replace(/^@/, "");

    if (!query) {
      return res.status(200).json({
        success: true,
        message: "Users fetched successfully",
        data: [],
      });
    }

    // Keep it cheap: short queries can be too broad.
    if (query.length < 2) {
      return res.status(200).json({
        success: true,
        message: "Users fetched successfully",
        data: [],
      });
    }

    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = new RegExp(escaped, "i");

    const users = await User.find({
      username: { $exists: true, $ne: "", $regex: rx },
    })
      .select("_id name username image")
      .limit(10)
      .lean();

    return res.status(200).json({
      success: true,
      message: "Users fetched successfully",
      data: users,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: "Failed to search users",
      error: err.message,
    });
  }
};

// Suggest users to connect with (excludes self + existing friends).
const suggestions = async (req: Request, res: Response) => {
  try {
    const authUser = (req as Request & { user?: Express.User }).user;
    if (!authUser?._id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const limitRaw = req.query.limit as string | undefined;
    const limit = Math.max(1, Math.min(10, Number(limitRaw ?? 10) || 10));

    const me = await User.findById(authUser._id).select("friends").lean();
    const excludeIds = [authUser._id, ...((me?.friends ?? []) as any[])].map(
      (id) => new Types.ObjectId(String(id)),
    );

    const users = await User.aggregate([
      {
        $match: {
          _id: { $nin: excludeIds },
          username: { $exists: true, $ne: "" },
        },
      },
      { $sample: { size: limit } },
      { $project: { _id: 1, name: 1, username: 1, image: 1, bio: 1 } },
    ]);

    return res.status(200).json({
      success: true,
      message: "Suggestions fetched successfully",
      data: users,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch suggestions",
      error: err.message,
    });
  }
};

// Update the currently logged-in user's profile (owner-only).
const updateProfile = async (req: Request, res: Response) => {
  try {
    const authUser = (req as Request & { user?: Express.User }).user;
    if (!authUser?._id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Allowlist fields that are safe for users to edit themselves.
    const body = (req.body ?? {}) as UpdateProfileInput;
    const next: Record<string, unknown> = {};
    if (typeof body.name === "string") next.name = body.name.trim();
    if (typeof body.username === "string") {
      const username = body.username.trim();
      next.username = username.length ? username : undefined;
    }
    if (typeof body.bio === "string") next.bio = body.bio.trim();
    if (typeof body.image === "string") next.image = body.image.trim();
    // Backward-compat: if older clients still send `avatar`, treat it as `image`.
    if (typeof (req.body as any)?.avatar === "string" && !next.image) {
      next.image = String((req.body as any).avatar).trim();
    }

    if (!Object.keys(next).length) {
      return res.status(400).json({
        success: false,
        message: "No valid profile fields provided",
      });
    }

    const updated = await User.findByIdAndUpdate(authUser._id, next, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const userResponse = updated.toObject() as any;
    delete userResponse.password;
    delete userResponse.refreshToken;

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: userResponse,
    });
  } catch (err: any) {
    // Duplicate key errors are common when updating `username`.
    if (err?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Username already taken",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to update profile",
      error: err.message,
    });
  }
};

export const refreshAccessToken = async (req: Request, res: Response) => {
  const token = getCookie(req, "refreshToken");

  // Refresh token must be present as an httpOnly cookie.
  if (!token) return res.status(401).json({ message: "No refresh token" });

  try {
    // Verify the token is cryptographically valid
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET!) as {
      id: string;
    };

    // Find user and check token matches what we stored (rotation check)
    const user = await User.findById(decoded.id);
    if (!user || user.refreshToken !== token) {
      // Token reuse detected — a previously rotated token is being used
      // Invalidate everything (possible token theft)
      if (user) {
        user.refreshToken = null;
        await user.save();
      }
      return res.status(403).json({ message: "Token reuse detected" });
    }

    // Issue new token pair (rotation)
    const { accessToken, refreshToken: newRefreshToken } =
      await generateTokens(user);

    // Set new cookie
    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const userResponse = user.toObject() as any;
    delete userResponse.password;
    delete userResponse.refreshToken;
    return res.json({ accessToken, user: userResponse });
  } catch {
    return res
      .status(403)
      .json({ message: "Invalid or expired refresh token" });
  }
};

export const logout = async (req: Request, res: Response) => {
  const token = getCookie(req, "refreshToken");

  if (token) {
    // Invalidate in DB so the refresh token cannot be used again.
    await User.findOneAndUpdate(
      { refreshToken: token },
      { refreshToken: null },
    );
  }

  // Clearing cookies should use the same cookie attributes used when setting it.
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });

  return res.json({ message: "Logged out" });
};

export const userControllers = {
  register,
  login,
  getUser,
  getUserByUsername,
  searchUsers,
  suggestions,
  updateProfile,
  refreshAccessToken,
  logout,
};
