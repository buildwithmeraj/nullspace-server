import express from "express";
import { userControllers } from "../controllers/user.controller";
import passport from "passport";
import { generateTokens } from "../utilities/token";
import type { HydratedDocument } from "mongoose";
import type { IUser } from "../types/user.interface";

const router = express.Router();

// Register user
router.post("/register", userControllers.register);
// Login user
router.post("/login", userControllers.login);
// Logout user
router.post("/logout", userControllers.logout);
// Refresh access token
router.post("/refresh", userControllers.refreshAccessToken);

// Google auth
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  }),
);

// Get a user by email
router.get("/:email", userControllers.getUser);

// Google auth callback
router.get(
  "/google/callback",
  passport.authenticate("google", { session: false }),
  async (req, res) => {
    const user = req.user as HydratedDocument<IUser> | undefined;
    if (!user?._id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { accessToken, refreshToken } = await generateTokens(user);

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Redirect to frontend with accessToken as a URL param (short-lived, safe)
    res.redirect(
      `${process.env.CLIENT_URL}/auth/callback?token=${accessToken}`,
    );
  },
);

export const UserRoutes = router;
