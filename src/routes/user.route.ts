import express from "express";
import { userControllers } from "../controllers/user.controller";
import passport from "passport";
import { generateTokens } from "../utilities/token";
import type { HydratedDocument } from "mongoose";
import type { IUser } from "../types/user.interface";
import { protect } from "../middleware/auth";

const router = express.Router();
const cookieSameSite = process.env.NODE_ENV === "production" ? "none" : "lax";

// Logout user
router.post("/logout", userControllers.logout);

// Update current user's profile
router.patch("/me", protect, userControllers.updateProfile);

// Suggest random users to connect with
router.get("/suggestions", protect, userControllers.suggestions);

// Search users (for mentions/autocomplete)
router.get("/search", protect, userControllers.searchUsers);

// Get a user by username
router.get("/username/:username", userControllers.getUserByUsername);

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
  passport.authenticate("google", {
    session: false,
    failureRedirect: `${process.env.CLIENT_URL ?? "http://localhost:3000"}/login?error=use_credentials`,
  }),
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
      sameSite: cookieSameSite,
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Redirect to frontend with accessToken as a URL param (short-lived, safe)
    res.redirect(`${process.env.CLIENT_URL}/auth/callback?token=${accessToken}`);
  },
);

export const UserRoutes = router;
