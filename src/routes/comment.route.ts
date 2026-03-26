import express from "express";
import { protect } from "../middleware/auth";
import { commentControllers } from "../controllers/comment.controller";

const router = express.Router();

// Comments are authenticated actions (JWT `Authorization: Bearer <token>`).
router.use(protect);

router.post("/", commentControllers.create);
router.get("/", commentControllers.list);
router.get("/:id", commentControllers.getById);
router.patch("/:id", commentControllers.update);
router.delete("/:id", commentControllers.remove);

export const CommentRoutes = router;

