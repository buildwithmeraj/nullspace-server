import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import config from ".";
import { User } from "../models/user.model";

function getServerOrigin() {
  // Google OAuth absolute callback URL
  return (
    process.env.SERVER_URL?.replace(/\/+$/, "") ??
    `http://localhost:${String(config.port ?? 5000)}`
  );
}

// Must match the callback route (and the value configured in Google Cloud Console).
const googleCallbackUrl = `${getServerOrigin()}/api/v1/users/google/callback`;

passport.use(
  new GoogleStrategy(
    {
      // Use empty-string fallbacks to keep passport/google-oauth20 happy at runtime;
      // misconfiguration will surface quickly when the strategy is invoked.
      clientID: config.google_client_id ?? "",
      clientSecret: config.google_client_secret ?? "",
      callbackURL: googleCallbackUrl,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        const photo = profile.photos?.[0]?.value;

        // We request "email" scope, but some Google accounts/profiles may still not
        // expose it; treat that as a hard failure because our user model requires it.
        if (!email) {
          return done(new Error("Google profile is missing email"), undefined);
        }

        // First, try to log in an existing account that already linked Google.
        const existingByGoogleId = await User.findOne({ googleId: profile.id });
        if (existingByGoogleId) return done(null, existingByGoogleId);

        // Otherwise, link Google to an existing local account with the same email.
        const existingByEmail = await User.findOne({ email });
        if (existingByEmail) {
          existingByEmail.googleId = profile.id;
          existingByEmail.authProvider = "google";
          if (!existingByEmail.image) existingByEmail.image = photo ?? "";
          if (!existingByEmail.avatar && photo) existingByEmail.avatar = photo;
          await existingByEmail.save();
          return done(null, existingByEmail);
        }

        // No matching user: create a new account seeded from the Google profile.
        const created = await User.create({
          name: profile.displayName || "Google User",
          email,
          image: photo ?? "https://placehold.co/256x256",
          avatar: photo,
          googleId: profile.id,
          authProvider: "google",
        });
        return done(null, created);
      } catch (err) {
        return done(err as Error, undefined);
      }
    },
  ),
);
