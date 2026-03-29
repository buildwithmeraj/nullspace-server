import express from "express";
import { UserRoutes } from "./user.route";
import { CloudinaryRoutes } from "./cloudinary.route";
import { PostRoutes } from "./post.route";
import { ReactionRoutes } from "./reaction.route";
import { CommentRoutes } from "./comment.route";
import { FriendRoutes } from "./friend.route";
import { NotificationRoutes } from "./notification.route";

const router = express.Router();

// Central route registry: mount feature routers under their base paths.
const moduleRoutes = [
  {
    path: "/users",
    route: UserRoutes,
  },
  {
    path: "/posts",
    route: PostRoutes,
  },
  {
    path: "/reactions",
    route: ReactionRoutes,
  },
  {
    path: "/comments",
    route: CommentRoutes,
  },
  {
    path: "/friends",
    route: FriendRoutes,
  },
  {
    path: "/cloudinary",
    route: CloudinaryRoutes,
  },
  {
    path: "/notifications",
    route: NotificationRoutes,
  },
];

moduleRoutes.forEach((route) => router.use(route.path, route.route));

export default router;
