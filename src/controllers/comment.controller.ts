import type { Request, Response } from "express";
import { Comment } from "../models/comment.model";
import { Post } from "../models/post.model";
import { notify } from "../utilities/notify";
import { User } from "../models/user.model";

const COMMENT_CONTENT_MAX_CHARS = 5_000;

type CommentAuthor = { _id: unknown; name?: string; username?: string; image?: string };

function getRequestUser(req: Request) {
  return (req as Request & { user?: Express.User }).user;
}

function isAdmin(user: Express.User | undefined) {
  return user?.role === "admin";
}

function isOwner(user: Express.User | undefined, commentUserId: unknown) {
  if (!user?._id) return false;
  return String(user._id) === String(commentUserId);
}

async function attachAuthors<T extends { userId: unknown }>(comments: T[]) {
  const userIds = Array.from(
    new Set(comments.map((c) => String(c.userId)).filter(Boolean)),
  );
  if (!userIds.length) {
    return comments.map((c) => ({ ...c, user: null as CommentAuthor | null }));
  }

  const users = await User.find({ _id: { $in: userIds } })
    .select("_id name username image")
    .lean();
  const byId = new Map<string, CommentAuthor>();
  for (const u of users) byId.set(String(u._id), u as CommentAuthor);

  return comments.map((c) => ({
    ...c,
    user: byId.get(String(c.userId)) ?? null,
  }));
}

const create = async (req: Request, res: Response) => {
  const user = getRequestUser(req);
  if (!user?._id) return res.status(401).json({ success: false, message: "Unauthorized" });

  const postId = req.body?.postId;
  const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";

  if (!postId) return res.status(400).json({ success: false, message: "postId is required" });
  if (!content) return res.status(400).json({ success: false, message: "content is required" });
  if (content.length > COMMENT_CONTENT_MAX_CHARS) {
    return res.status(400).json({
      success: false,
      message: `content exceeds the limit of ${COMMENT_CONTENT_MAX_CHARS} characters`,
    });
  }

  const comment = await Comment.create({ postId, userId: user._id, content });
  const commentObj = comment.toObject() as { userId: unknown };
  const author = await User.findById(commentObj.userId)
    .select("_id name username image")
    .lean();

  // Notify post owner (skip notifying yourself).
  const post = await Post.findById(postId).select("userId").lean();
  const ownerId = post?.userId ? String(post.userId) : null;
  if (ownerId && ownerId !== String(user._id)) {
    await notify({
      userId: ownerId,
      type: "comment",
      message: `${String(user.name ?? "Someone")} commented on your post`,
      data: {
        postId: String(postId),
        commentId: String((comment as any)._id),
        fromUsername: String(user.username ?? ""),
        fromName: String(user.name ?? ""),
      },
    });
  }

  return res.status(201).json({
    success: true,
    message: "Comment created",
    data: { ...commentObj, user: (author as CommentAuthor) ?? null },
  });
};

const list = async (req: Request, res: Response) => {
  const user = getRequestUser(req);
  if (!user?._id) return res.status(401).json({ success: false, message: "Unauthorized" });

  const postId = req.query.postId as string | undefined;

  // Any logged-in user can view comments for a given post. Without `postId`,
  // non-admins only see their own comments.
  const query: Record<string, unknown> = {};
  if (postId) query.postId = postId;
  else if (!isAdmin(user)) query.userId = user._id;

  type LeanComment = {
    _id: unknown;
    postId: unknown;
    userId: unknown;
    content: string;
    createdAt?: Date;
    updatedAt?: Date;
  };

  const comments = await Comment.find(query)
    .sort({ createdAt: -1 })
    .lean<LeanComment[]>();
  const withAuthors = postId ? await attachAuthors(comments) : comments;
  return res.status(200).json({
    success: true,
    message: "Comments fetched",
    data: withAuthors,
  });
};

const getById = async (req: Request, res: Response) => {
  const user = getRequestUser(req);
  if (!user?._id) return res.status(401).json({ success: false, message: "Unauthorized" });

  const comment = await Comment.findById(req.params.id);
  if (!comment) return res.status(404).json({ success: false, message: "Comment not found" });

  // Owner-only access (unless admin).
  if (!isAdmin(user) && !isOwner(user, comment.userId)) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }

  return res.status(200).json({ success: true, message: "Comment fetched", data: comment });
};

const update = async (req: Request, res: Response) => {
  const user = getRequestUser(req);
  if (!user?._id) return res.status(401).json({ success: false, message: "Unauthorized" });

  const comment = await Comment.findById(req.params.id);
  if (!comment) return res.status(404).json({ success: false, message: "Comment not found" });

  // Owner-only mutations (unless admin).
  if (!isAdmin(user) && !isOwner(user, comment.userId)) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }

  const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
  if (!content) return res.status(400).json({ success: false, message: "content is required" });
  if (content.length > COMMENT_CONTENT_MAX_CHARS) {
    return res.status(400).json({
      success: false,
      message: `content exceeds the limit of ${COMMENT_CONTENT_MAX_CHARS} characters`,
    });
  }

  comment.content = content;
  await comment.save();
  return res.status(200).json({ success: true, message: "Comment updated", data: comment });
};

const remove = async (req: Request, res: Response) => {
  const user = getRequestUser(req);
  if (!user?._id) return res.status(401).json({ success: false, message: "Unauthorized" });

  const comment = await Comment.findById(req.params.id);
  if (!comment) return res.status(404).json({ success: false, message: "Comment not found" });

  // Owner-only deletion (unless admin).
  if (!isAdmin(user) && !isOwner(user, comment.userId)) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }

  await comment.deleteOne();
  return res.status(200).json({ success: true, message: "Comment deleted" });
};

export const commentControllers = { create, list, getById, update, remove };
