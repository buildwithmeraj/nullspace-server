import type { Request, Response } from "express";
import { Comment } from "../models/comment.model";

const COMMENT_CONTENT_MAX_CHARS = 5_000;

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
  return res.status(201).json({ success: true, message: "Comment created", data: comment });
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

  const comments = await Comment.find(query).sort({ createdAt: -1 });
  return res.status(200).json({ success: true, message: "Comments fetched", data: comments });
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
