import bcrypt from "bcrypt";
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { User } from "../models/user.model";
import { generateTokens } from "../utilities/token";

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
    const { email } = req.body;

    // Check if user already exists
    const isUserExist = await User.findOne({ email });

    if (isUserExist) {
      return res.status(400).json({
        success: false,
        message: "User already exists!",
      });
    }

    const savedUser = await User.create(req.body);

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

    // Compare passwords
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

// // Get all users
// const getUsers = async (req: Request, res: Response) => {
//   try {
//     const users = await User.find().select("-password");
//     res.status(200).json({
//       success: true,
//       message: "Users fetched successfully",
//       data: users,
//     });
//   } catch (err: any) {
//     res.status(500).json({
//       success: false,
//       message: "Failed to fetch users",
//       error: err.message,
//     });
//   }
// };

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
  refreshAccessToken,
  logout,
};
