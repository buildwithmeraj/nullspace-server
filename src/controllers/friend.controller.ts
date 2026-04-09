import type { Request, Response } from "express";
import { Friend } from "../models/friend.model";
import { User } from "../models/user.model";
import { notify } from "../utilities/notify";

type FriendUser = {
  _id: unknown;
  name?: string;
  username?: string;
  image?: string;
  bio?: string;
};

function getRequestUser(req: Request) {
  return (req as Request & { user?: Express.User }).user;
}

function isAdmin(user: Express.User | undefined) {
  return user?.role === "admin";
}

function isParticipant(
  user: Express.User | undefined,
  requesterId: unknown,
  recipientId: unknown,
) {
  if (!user?._id) return false;
  const uid = String(user._id);
  return uid === String(requesterId) || uid === String(recipientId);
}

async function syncFriendsOnAccept(
  requesterId: unknown,
  recipientId: unknown,
) {
  // Keep `User.friends` in sync for fast reads.
  const requester = String(requesterId);
  const recipient = String(recipientId);
  await Promise.all([
    User.updateOne({ _id: requester }, { $addToSet: { friends: recipient } }),
    User.updateOne({ _id: recipient }, { $addToSet: { friends: requester } }),
  ]);
}

async function syncFriendsOnRemove(
  requesterId: unknown,
  recipientId: unknown,
) {
  const requester = String(requesterId);
  const recipient = String(recipientId);
  await Promise.all([
    User.updateOne({ _id: requester }, { $pull: { friends: recipient } }),
    User.updateOne({ _id: recipient }, { $pull: { friends: requester } }),
  ]);
}

async function attachUsers<
  T extends { requesterId: unknown; recipientId: unknown },
>(relationships: T[]) {
  const ids = Array.from(
    new Set(
      relationships
        .flatMap((item) => [String(item.requesterId), String(item.recipientId)])
        .filter(Boolean),
    ),
  );

  if (!ids.length) return relationships;

  const users = await User.find({ _id: { $in: ids } })
    .select("_id name username image bio")
    .lean();
  const userById = new Map<string, FriendUser>();
  for (const user of users) {
    userById.set(String(user._id), user as FriendUser);
  }

  return relationships.map((item) => ({
    ...item,
    requester: userById.get(String(item.requesterId)) ?? null,
    recipient: userById.get(String(item.recipientId)) ?? null,
  }));
}

const create = async (req: Request, res: Response) => {
  // Create a friend request (pending).
  const user = getRequestUser(req);
  if (!user?._id) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const recipientId = req.body?.recipientId;
  if (!recipientId) {
    return res
      .status(400)
      .json({ success: false, message: "recipientId is required" });
  }
  if (String(recipientId) === String(user._id)) {
    return res
      .status(400)
      .json({ success: false, message: "Cannot friend yourself" });
  }

  // Prevent duplicate requests in either direction.
  const existing = await Friend.findOne({
    $or: [
      { requesterId: user._id, recipientId },
      { requesterId: recipientId, recipientId: user._id },
    ],
  });
  if (existing) {
    return res.status(409).json({
      success: false,
      message: "Friend request already exists",
      data: existing,
    });
  }

  const friend = await Friend.create({
    requesterId: user._id,
    recipientId,
    status: "pending",
  });

  // Notify recipient in real-time (and store in DB).
  await notify({
    userId: String(recipientId),
    type: "alliance_request",
    message: `${String(user.name ?? "Someone")} sent you an alliance request`,
    data: {
      friendId: String((friend as any)._id),
      requesterId: String(user._id),
      fromUsername: String(user.username ?? ""),
      fromName: String(user.name ?? ""),
    },
  });

  return res
    .status(201)
    .json({ success: true, message: "Friend request sent", data: friend });
};

const list = async (req: Request, res: Response) => {
  const user = getRequestUser(req);
  if (!user?._id) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const status = req.query.status as string | undefined; // "pending" | "accepted"

  const query: Record<string, unknown> = isAdmin(user)
    ? {}
    : { $or: [{ requesterId: user._id }, { recipientId: user._id }] };
  if (status) query.status = status;

  const friends = await Friend.find(query).sort({ createdAt: -1 }).lean();
  const withUsers = await attachUsers(friends);
  return res
    .status(200)
    .json({ success: true, message: "Friends fetched", data: withUsers });
};

const getById = async (req: Request, res: Response) => {
  const user = getRequestUser(req);
  if (!user?._id) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const friend = await Friend.findById(req.params.id).lean();
  if (!friend) {
    return res
      .status(404)
      .json({ success: false, message: "Friend not found" });
  }

  if (
    !isAdmin(user) &&
    !isParticipant(user, friend.requesterId, friend.recipientId)
  ) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }

  const [withUsers] = await attachUsers([friend]);
  return res
    .status(200)
    .json({ success: true, message: "Friend fetched", data: withUsers });
};

const update = async (req: Request, res: Response) => {
  // Update is used for accepting a request. Only the recipient (or admin) can accept.
  const user = getRequestUser(req);
  if (!user?._id) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const friend = await Friend.findById(req.params.id);
  if (!friend) {
    return res
      .status(404)
      .json({ success: false, message: "Friend not found" });
  }

  if (!isAdmin(user) && String(friend.recipientId) !== String(user._id)) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }

  if (friend.status === "accepted") {
    return res
      .status(200)
      .json({ success: true, message: "Already accepted", data: friend });
  }

  friend.status = "accepted";
  await friend.save();
  await syncFriendsOnAccept(friend.requesterId, friend.recipientId);

  // Notify requester that the recipient accepted.
  await notify({
    userId: String(friend.requesterId),
    type: "alliance_accepted",
    message: `${String(user.name ?? "Someone")} accepted your alliance request`,
    data: {
      friendId: String((friend as any)._id),
      recipientId: String(user._id),
      fromUsername: String(user.username ?? ""),
      fromName: String(user.name ?? ""),
    },
  });

  return res
    .status(200)
    .json({ success: true, message: "Friend request accepted", data: friend });
};

const remove = async (req: Request, res: Response) => {
  // Remove covers: cancel request, reject request, or unfriend.
  const user = getRequestUser(req);
  if (!user?._id) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const friend = await Friend.findById(req.params.id);
  if (!friend) {
    return res
      .status(404)
      .json({ success: false, message: "Friend not found" });
  }

  if (
    !isAdmin(user) &&
    !isParticipant(user, friend.requesterId, friend.recipientId)
  ) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }

  const wasAccepted = friend.status === "accepted";
  const requesterId = friend.requesterId;
  const recipientId = friend.recipientId;

  await friend.deleteOne();
  if (wasAccepted) await syncFriendsOnRemove(requesterId, recipientId);

  return res.status(200).json({ success: true, message: "Friend removed" });
};

export const friendControllers = { create, list, getById, update, remove };
