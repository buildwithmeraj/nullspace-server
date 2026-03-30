import type { CookieOptions, Request } from "express";

function isHttpsRequest(req: Request) {
  if ((req as any).secure) return true;
  const xfProto = String(req.headers["x-forwarded-proto"] ?? "").toLowerCase();
  return xfProto.includes("https");
}

/**
 * Refresh-token cookie options that work for both local dev and Render+Vercel.
 * - Cross-site requests require `SameSite=None; Secure`.
 * - In dev over http, `Secure` must be false (otherwise cookie is dropped).
 */
export function getRefreshCookieOptions(req: Request): CookieOptions {
  const secure = isHttpsRequest(req);
  return {
    httpOnly: true,
    secure,
    // `SameSite=None` is only valid when `Secure` is true; otherwise browsers drop it.
    sameSite: secure ? "none" : "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  };
}

export function getRefreshCookieClearOptions(req: Request): CookieOptions {
  const secure = isHttpsRequest(req);
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? "none" : "lax",
    path: "/",
  };
}

