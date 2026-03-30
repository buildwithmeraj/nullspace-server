// Ensure `.env` is loaded even if this file is used as an entrypoint.
import "./config";

import cors from "cors";
import express, { Application, Request, Response } from "express";
import passport from "passport";
import type { HydratedDocument } from "mongoose";
import router from "./routes";
import "./config/passport";
import { generateTokens } from "./utilities/token";
import type { IUser } from "./types/user.interface";

const app: Application = express();

// Middleware
// Increase JSON size limit to support base64/data-uri uploads when needed.
app.use(express.json({ limit: "10mb" }));
app.use(
  cors({
    // Allow the frontend origin to send cookies (refresh token cookie).
    origin: process.env.CLIENT_URL ?? "http://localhost:3000",
    credentials: true,
  }),
);
app.use(passport.initialize());

// These routes are used by some clients that still rely on the legacy `/auth/google/*`
// paths (the primary callback lives under `/api/v1/users/google/callback`).
const serverOrigin =
  process.env.SERVER_URL?.replace(/\/+$/, "") ??
  `http://localhost:${String(process.env.PORT ?? 5000)}`;
const authGoogleCallbackUrl = `${serverOrigin}/auth/google/callback`;

async function redirectWithTokens(req: Request, res: Response) {
  // Passport attaches the authenticated user onto `req.user`.
  const user = req.user as HydratedDocument<IUser> | undefined;
  if (!user?._id) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  // Issue a new token pair and store refresh token in an httpOnly cookie.
  const { accessToken, refreshToken } = await generateTokens(user);
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  // Redirect back to the frontend with the short-lived access token.
  return res.redirect(
    `${process.env.CLIENT_URL}/auth/callback?token=${accessToken}`,
  );
}

// Back-compat Google OAuth routes (some setups use these paths)
app.get(
  "/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
    callbackURL: authGoogleCallbackUrl,
  } as any),
);
app.get(
  "/auth/google/callback",
  passport.authenticate("google", {
    session: false,
    callbackURL: authGoogleCallbackUrl,
    failureRedirect: `${process.env.CLIENT_URL ?? "http://localhost:3000"}/login?error=use_credentials`,
  } as any),
  redirectWithTokens,
);

// Application routes
app.use("/api/v1", router);

// Testing route
app.get("/", (req: Request, res: Response) => {
  res.send("NullSpace Server Server is running!");
});

// Not found (404) route
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

export default app;
