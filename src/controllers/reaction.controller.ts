import type { Request, Response } from "express";
import { Reaction } from "../models/reaction.model";

function getRequestUser(req: Request) {
  return (req as Request & { user?: Express.User }).user;
}

function isAdmin(user: Express.User | undefined) {
  return user?.role === "admin";
}

function isMember(user: Express.User | undefined, userIds: unknown) {
  if (!user?._id || !Array.isArray(userIds)) return false;
  return userIds.some((id) => String(id) === String(user._id));
}

const create = async (req: Request, res: Response) => {
  // "Create" means: ensure a reaction document exists for the post and add the
  // current user to the love set.
  const user = getRequestUser(req);
  if (!user?._id) return res.status(401).json({ success: false, message: "Unauthorized" });

  const postId = req.body?.postId;
  if (!postId) return res.status(400).json({ success: false, message: "postId is required" });

  const reaction = await Reaction.findOneAndUpdate(
    { postId },
    { $addToSet: { userIds: user._id } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  return res.status(201).json({ success: true, message: "Reaction saved", data: reaction });
};

const list = async (req: Request, res: Response) => {
  const user = getRequestUser(req);
  if (!user?._id) return res.status(401).json({ success: false, message: "Unauthorized" });

  const postId = req.query.postId as string | undefined;

  // Non-admins only see reactions they are part of.
  const query: Record<string, unknown> = isAdmin(user) ? {} : { userIds: user._id };
  if (postId) query.postId = postId;

  const reactions = await Reaction.find(query);
  return res.status(200).json({ success: true, message: "Reactions fetched", data: reactions });
};

const getById = async (req: Request, res: Response) => {
  const user = getRequestUser(req);
  if (!user?._id) return res.status(401).json({ success: false, message: "Unauthorized" });

  const reaction = await Reaction.findById(req.params.id);
  if (!reaction) return res.status(404).json({ success: false, message: "Reaction not found" });

  // Only members or admin can read the raw `userIds` list.
  if (!isAdmin(user) && !isMember(user, reaction.userIds)) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }

  return res.status(200).json({ success: true, message: "Reaction fetched", data: reaction });
};

const update = async (req: Request, res: Response) => {
  // Update supports only love/unlove operations for the current user.
  const user = getRequestUser(req);
  if (!user?._id) return res.status(401).json({ success: false, message: "Unauthorized" });

  const action = req.body?.action;
  const reaction = await Reaction.findById(req.params.id);
  if (!reaction) return res.status(404).json({ success: false, message: "Reaction not found" });

  // Owner rule for reactions:
  // - Any logged-in user can "love" a post by adding themselves.
  // - Only members (or admin) can "unlove" (remove themselves).
  if (!isAdmin(user) && action === "unlove" && !isMember(user, reaction.userIds)) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }

  if (action === "unlove") {
    reaction.userIds = reaction.userIds.filter((id) => String(id) !== String(user._id));
  } else if (!isMember(user, reaction.userIds)) {
    reaction.userIds = [...reaction.userIds, user._id];
  }

  // If unlove removed the last user, delete the document to keep the collection lean.
  if (!reaction.userIds.length) {
    await reaction.deleteOne();
    return res.status(200).json({ success: true, message: "Reaction removed" });
  }

  await reaction.save();
  return res.status(200).json({ success: true, message: "Reaction updated", data: reaction });
};

const remove = async (req: Request, res: Response) => {
  const user = getRequestUser(req);
  if (!user?._id) return res.status(401).json({ success: false, message: "Unauthorized" });

  const reaction = await Reaction.findById(req.params.id);
  if (!reaction) return res.status(404).json({ success: false, message: "Reaction not found" });

  if (isAdmin(user)) {
    await reaction.deleteOne();
    return res.status(200).json({ success: true, message: "Reaction deleted" });
  }

  // For non-admins, "delete" means removing their own love.
  if (!isMember(user, reaction.userIds)) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }

  reaction.userIds = reaction.userIds.filter((id) => String(id) !== String(user._id));
  if (!reaction.userIds.length) {
    await reaction.deleteOne();
    return res.status(200).json({ success: true, message: "Reaction removed" });
  }
  await reaction.save();
  return res.status(200).json({ success: true, message: "Reaction removed", data: reaction });
};

export const reactionControllers = { create, list, getById, update, remove };
