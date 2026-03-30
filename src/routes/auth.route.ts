import express from "express";
import { userControllers } from "../controllers/user.controller";

const router = express.Router();

// Backend owns auth; frontend only maintains a lightweight session cache.
router.post("/register", userControllers.register);
router.post("/login", userControllers.login);
// Rotates/returns a new access token using the httpOnly refresh cookie.
router.post("/refresh-token", userControllers.refreshAccessToken);

export const AuthRoutes = router;
