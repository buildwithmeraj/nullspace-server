import type { Request, Response } from "express";
import { Notification } from "../models/notification.model";

function getRequestUser(req: Request) {
  return (req as Request & { user?: Express.User }).user;
}

const list = async (req: Request, res: Response) => {
  const user = getRequestUser(req);
  if (!user?._id)
    return res.status(401).json({ success: false, message: "Unauthorized" });

  const limitRaw = req.query.limit as string | undefined;
  const limit = Math.min(Math.max(Number(limitRaw ?? 30) || 30, 1), 100);

  const notifications = await Notification.find({ userId: user._id })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  const unread = await Notification.countDocuments({
    userId: user._id,
    read: false,
  });

  return res.status(200).json({
    success: true,
    message: "Notifications fetched",
    data: { notifications, unread },
  });
};

const markRead = async (req: Request, res: Response) => {
  const user = getRequestUser(req);
  if (!user?._id)
    return res.status(401).json({ success: false, message: "Unauthorized" });

  const id = req.params.id;
  const updated = await Notification.findOneAndUpdate(
    { _id: id, userId: user._id },
    { read: true },
    { new: true },
  );

  if (!updated) {
    return res
      .status(404)
      .json({ success: false, message: "Notification not found" });
  }

  return res.status(200).json({
    success: true,
    message: "Notification marked as read",
    data: updated,
  });
};

const markAllRead = async (req: Request, res: Response) => {
  const user = getRequestUser(req);
  if (!user?._id)
    return res.status(401).json({ success: false, message: "Unauthorized" });

  await Notification.updateMany({ userId: user._id, read: false }, { read: true });

  return res
    .status(200)
    .json({ success: true, message: "All notifications marked as read" });
};

export const notificationControllers = { list, markRead, markAllRead };

