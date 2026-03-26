import express from "express";
import { protect } from "../middleware/auth";
import { postControllers } from "../controllers/post.controller";

const router = express.Router();

// All post endpoints require authentication (JWT `Authorization: Bearer <token>`).
router.use(protect);

router.post("/", postControllers.create);
router.get("/", postControllers.list);
router.get("/:id", postControllers.getById);
router.patch("/:id", postControllers.update);
router.delete("/:id", postControllers.remove);

export const PostRoutes = router;
