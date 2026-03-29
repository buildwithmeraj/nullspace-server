import { Notification } from "../models/notification.model";
import type { NotificationType } from "../types/notification.interface";
import { getIo, userRoom } from "../socket";

type NotifyInput = {
  userId: string;
  type: NotificationType;
  message: string;
  data?: Record<string, unknown>;
};

export async function notify(input: NotifyInput) {
  const created = await Notification.create({
    userId: input.userId,
    type: input.type,
    message: input.message,
    data: input.data,
    read: false,
  });

  const io = getIo();
  if (io) {
    io.to(userRoom(String(input.userId))).emit("notification", {
      _id: String((created as any)._id),
      userId: String(input.userId),
      type: input.type,
      message: input.message,
      data: input.data ?? undefined,
      read: false,
      createdAt: created.createdAt,
    });
  }

  return created;
}

