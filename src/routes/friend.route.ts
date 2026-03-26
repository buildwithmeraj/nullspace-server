import express from "express";
import { protect } from "../middleware/auth";
import { friendControllers } from "../controllers/friend.controller";

const router = express.Router();

// Friends are authenticated actions (JWT `Authorization: Bearer <token>`).
router.use(protect);

// Create friend request (pending)
router.post("/", friendControllers.create);
// List relationships for current user (admin sees all)
router.get("/", friendControllers.list);
// Get by id (participants or admin)
router.get("/:id", friendControllers.getById);
// Accept friend request (recipient or admin)
router.patch("/:id", friendControllers.update);
// Cancel/reject/unfriend (participants or admin)
router.delete("/:id", friendControllers.remove);

export const FriendRoutes = router;

