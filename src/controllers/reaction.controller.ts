import type { Request, Response } from "express";
import { Reaction } from "../models/reaction.model";
import { Post } from "../models/post.model";
import { notify } from "../utilities/notify";

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

const summaryByPost = async (req: Request, res: Response) => {
  const user = getRequestUser(req);
  if (!user?._id)
    return res.status(401).json({ success: false, message: "Unauthorized" });

  const postId = String(req.params.postId ?? "").trim();
  if (!postId)
    return res
      .status(400)
      .json({ success: false, message: "postId is required" });

  // Share only what the client needs (count + my state). We deliberately avoid
  // exposing the full `userIds` list to non-admins.
  const reaction = await Reaction.findOne({ postId }).select("postId userIds");
  const userIds = (reaction as any)?.userIds ?? [];
  const count = Array.isArray(userIds) ? userIds.length : 0;
  const lovedByMe = isMember(user, userIds);

  return res.status(200).json({
    success: true,
    message: "Reaction summary fetched",
    data: {
      reactionId: reaction?._id ? String(reaction._id) : null,
      postId: String(postId),
      count,
      lovedByMe,
    },
  });
};

const create = async (req: Request, res: Response) => {
  // "Create" means: ensure a reaction document exists for the post and add the
  // current user to the love set.
  const user = getRequestUser(req);
  if (!user?._id) return res.status(401).json({ success: false, message: "Unauthorized" });

  const postId = req.body?.postId;
  if (!postId) return res.status(400).json({ success: false, message: "postId is required" });

  const existing = await Reaction.findOne({ postId }).select("userIds").lean();
  const alreadyLoved = existing?.userIds?.some((id) => String(id) === String(user._id)) ?? false;

  const reaction = await Reaction.findOneAndUpdate(
    { postId },
    { $addToSet: { userIds: user._id } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  // Notify post owner only on first-time "love" (and skip notifying yourself).
  if (!alreadyLoved) {
    const post = await Post.findById(postId).select("userId").lean();
    const ownerId = post?.userId ? String(post.userId) : null;
    if (ownerId && ownerId !== String(user._id)) {
      await notify({
        userId: ownerId,
        type: "reaction",
        message: `${String(user.name ?? "Someone")} reacted to your post`,
        data: {
          postId: String(postId),
          fromUsername: String(user.username ?? ""),
          fromName: String(user.name ?? ""),
        },
      });
    }
  }

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

  const wasMember = isMember(user, reaction.userIds);

  if (action === "unlove") {
    reaction.userIds = reaction.userIds.filter((id) => String(id) !== String(user._id));
  } else if (!wasMember) {
    reaction.userIds = [...reaction.userIds, user._id];
  }

  // If unlove removed the last user, delete the document to keep the collection lean.
  if (!reaction.userIds.length) {
    await reaction.deleteOne();
    return res.status(200).json({ success: true, message: "Reaction removed" });
  }

  await reaction.save();

  // Notify only when a new love was added (not on unlove / no-op).
  if (action !== "unlove" && !wasMember) {
    const postId = String((reaction as any).postId);
    const post = await Post.findById(postId).select("userId").lean();
    const ownerId = post?.userId ? String(post.userId) : null;
    if (ownerId && ownerId !== String(user._id)) {
      await notify({
        userId: ownerId,
        type: "reaction",
        message: `${String(user.name ?? "Someone")} reacted to your post`,
        data: {
          postId,
          fromUsername: String(user.username ?? ""),
          fromName: String(user.name ?? ""),
        },
      });
    }
  }

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

export const reactionControllers = {
  summaryByPost,
  create,
  list,
  getById,
  update,
  remove,
};
