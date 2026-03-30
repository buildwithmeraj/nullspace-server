import express from "express";
import { protect } from "../middleware/auth";
import { reactionControllers } from "../controllers/reaction.controller";

const router = express.Router();

// Love reactions are user-authenticated actions (JWT).
router.use(protect);

// Summary for a post (count + whether the current user loved it).
router.get("/summary/:postId", reactionControllers.summaryByPost);
router.post("/", reactionControllers.create);
router.get("/", reactionControllers.list);
router.get("/:id", reactionControllers.getById);
router.patch("/:id", reactionControllers.update);
router.delete("/:id", reactionControllers.remove);

export const ReactionRoutes = router;
