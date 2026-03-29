import express from "express";
import { protect } from "../middleware/auth";
import { notificationControllers } from "../controllers/notification.controller";

const router = express.Router();

router.use(protect);

router.get("/", notificationControllers.list);
router.patch("/read-all", notificationControllers.markAllRead);
router.patch("/:id/read", notificationControllers.markRead);

export const NotificationRoutes = router;

