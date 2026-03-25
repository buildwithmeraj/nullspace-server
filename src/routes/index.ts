import express from "express";
import { UserRoutes } from "./user.route";

const router = express.Router();

// Central route registry: mount feature routers under their base paths.
const moduleRoutes = [
  {
    path: "/users",
    route: UserRoutes,
  },
];

moduleRoutes.forEach((route) => router.use(route.path, route.route));

export default router;
