import express from "express";
import { userControllers } from "../controllers/user.controller";
import passport from "passport";
import { generateTokens } from "../utilities/token";
import type { HydratedDocument } from "mongoose";
import type { IUser } from "../types/user.interface";
import { protect } from "../middleware/auth";
import { getRefreshCookieOptions } from "../utilities/refreshCookie";

const router = express.Router();

// Logout user
router.post("/logout", userControllers.logout);

// Get current user (token-based; used by frontend after OAuth redirect)
router.get("/me", protect, userControllers.getMe);

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
  (req, res, next) => {
    // Use the custom callback form so we can gracefully handle OAuth errors
    // (otherwise passport errors bubble as 500s with no helpful redirect).
    passport.authenticate(
      "google",
      { session: false },
      async (err: unknown, user: unknown, info: unknown) => {
        const clientUrl = process.env.CLIENT_URL ?? "http://localhost:3000";

        if (err) {
          // Log for Render diagnostics; keep the client redirect generic.
          // eslint-disable-next-line no-console
          console.error("[Google OAuth] callback error:", err);
          return res.redirect(`${clientUrl}/login?error=google_auth_failed`);
        }

        // Provider mismatch: our strategy uses `USE_CREDENTIALS` to indicate a local account exists.
        const infoMessage =
          typeof (info as any)?.message === "string" ? (info as any).message : "";
        if (!user) {
          if (infoMessage === "USE_CREDENTIALS") {
            return res.redirect(`${clientUrl}/login?error=use_credentials`);
          }
          return res.redirect(`${clientUrl}/login?error=google_auth_failed`);
        }

        try {
          const typedUser = user as HydratedDocument<IUser>;
          const { accessToken, refreshToken } = await generateTokens(typedUser);

          res.cookie("refreshToken", refreshToken, getRefreshCookieOptions(req));

          // Redirect to frontend with accessToken as a URL param (short-lived, safe)
          return res.redirect(`${clientUrl}/auth/callback?token=${accessToken}`);
        } catch (tokenErr) {
          // eslint-disable-next-line no-console
          console.error("[Google OAuth] token issue:", tokenErr);
          return res.redirect(`${clientUrl}/login?error=google_auth_failed`);
        }
      },
    )(req, res, next);
  },
);

export const UserRoutes = router;
