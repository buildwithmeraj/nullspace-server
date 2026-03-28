import type { Request, Response } from "express";
import { Post } from "../models/post.model";
import type { IPostImage } from "../types/post.interface";
import { User } from "../models/user.model";

const POST_CONTENT_MAX_CHARS = 10_000;

type PostAuthor = { _id: unknown; name?: string; username?: string };

function getRequestUser(req: Request) {
  // `protect` middleware attaches `{ _id, name, username, email, role }` to `req.user`.
  return (req as Request & { user?: Express.User }).user;
}

function isAdmin(user: Express.User | undefined) {
  return user?.role === "admin";
}

function isOwner(user: Express.User | undefined, postUserId: unknown) {
  if (!user?._id) return false;
  return String(user._id) === String(postUserId);
}

function normalizeImages(images: unknown): IPostImage[] {
  // Keep controller resilient to bad payloads; schema still enforces max length.
  if (!Array.isArray(images)) return [];
  return images
    .filter((img) => img && typeof img === "object")
    .map((img) => img as IPostImage);
}

async function attachAuthors<T extends { userId: unknown }>(posts: T[]) {
  const userIds = Array.from(
    new Set(posts.map((p) => String(p.userId)).filter(Boolean)),
  );
  if (!userIds.length) {
    return posts.map((p) => ({ ...p, user: null as PostAuthor | null }));
  }

  const users = await User.find({ _id: { $in: userIds } })
    .select("_id name username")
    .lean();

  const userById = new Map<string, PostAuthor>();
  for (const u of users) userById.set(String(u._id), u as PostAuthor);

  return posts.map((p) => ({
    ...p,
    user: userById.get(String(p.userId)) ?? null,
  }));
}

const create = async (req: Request, res: Response) => {
  const user = getRequestUser(req);
  if (!user?._id)
    return res.status(401).json({ success: false, message: "Unauthorized" });

  const content =
    typeof req.body?.content === "string" ? req.body.content.trim() : "";
  const images = normalizeImages(req.body?.images);

  if (!content) {
    return res
      .status(400)
      .json({ success: false, message: "content is required" });
  }
  if (content.length > POST_CONTENT_MAX_CHARS) {
    return res.status(400).json({
      success: false,
      message: `content exceeds the limit of ${POST_CONTENT_MAX_CHARS} characters`,
    });
  }
  if (images.length > 5) {
    return res
      .status(400)
      .json({ success: false, message: "images exceeds the limit of 5" });
  }

  const post = await Post.create({ userId: user._id, content, images });
  const created = post.toObject() as { userId: unknown };
  const createdUser = await User.findById(created.userId)
    .select("_id name username")
    .lean();
  return res
    .status(201)
    .json({
      success: true,
      message: "Post created",
      data: { ...created, user: (createdUser as PostAuthor) ?? null },
    });
};

const list = async (req: Request, res: Response) => {
  const user = getRequestUser(req);
  if (!user?._id)
    return res.status(401).json({ success: false, message: "Unauthorized" });

  // Non-admins only see their own posts.
  const query = isAdmin(user) ? {} : { userId: user._id };
  const posts = await Post.find(query).sort({ createdAt: -1 }).lean();
  const postsWithUser = await attachAuthors(posts);
  return res
    .status(200)
    .json({ success: true, message: "Posts fetched", data: postsWithUser });
};

const listByUser = async (req: Request, res: Response) => {
  const user = getRequestUser(req);
  if (!user?._id)
    return res.status(401).json({ success: false, message: "Unauthorized" });

  const targetUserId = req.params.userId;
  if (!targetUserId) {
    return res
      .status(400)
      .json({ success: false, message: "userId is required" });
  }

  const posts = await Post.find({ userId: targetUserId })
    .sort({ createdAt: -1 })
    .lean();
  const postsWithUser = await attachAuthors(posts);
  return res
    .status(200)
    .json({ success: true, message: "Posts fetched", data: postsWithUser });
};

const listFriends = async (req: Request, res: Response) => {
  const user = getRequestUser(req);
  if (!user?._id)
    return res.status(401).json({ success: false, message: "Unauthorized" });

  const me = await User.findById(user._id).select("friends").lean();
  const friendIds = (me?.friends ?? []).map((id) => String(id));
  const filteredFriendIds = friendIds.filter((id) => id !== String(user._id));

  if (!filteredFriendIds.length) {
    return res
      .status(200)
      .json({ success: true, message: "Posts fetched", data: [] });
  }

  const posts = await Post.find({ userId: { $in: filteredFriendIds } })
    .sort({ createdAt: -1 })
    .lean();
  const postsWithUser = await attachAuthors(posts);
  return res
    .status(200)
    .json({ success: true, message: "Posts fetched", data: postsWithUser });
};

const getById = async (req: Request, res: Response) => {
  const user = getRequestUser(req);
  if (!user?._id)
    return res.status(401).json({ success: false, message: "Unauthorized" });

  const post = await Post.findById(req.params.id);
  if (!post)
    return res.status(404).json({ success: false, message: "Post not found" });

  // Owner-only access (unless admin).
  if (!isAdmin(user) && !isOwner(user, post.userId)) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }

  const postObj = post.toObject() as { userId: unknown };
  const postUser = await User.findById(postObj.userId)
    .select("_id name username")
    .lean();

  return res
    .status(200)
    .json({
      success: true,
      message: "Post fetched",
      data: { ...postObj, user: (postUser as PostAuthor) ?? null },
    });
};

const update = async (req: Request, res: Response) => {
  const user = getRequestUser(req);
  if (!user?._id)
    return res.status(401).json({ success: false, message: "Unauthorized" });

  const post = await Post.findById(req.params.id);
  if (!post)
    return res.status(404).json({ success: false, message: "Post not found" });

  // Owner-only mutations (unless admin).
  if (!isAdmin(user) && !isOwner(user, post.userId)) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }

  if (typeof req.body?.content === "string") {
    const nextContent = req.body.content.trim();
    if (!nextContent) {
      return res
        .status(400)
        .json({ success: false, message: "content is required" });
    }
    if (nextContent.length > POST_CONTENT_MAX_CHARS) {
      return res.status(400).json({
        success: false,
        message: `content exceeds the limit of ${POST_CONTENT_MAX_CHARS} characters`,
      });
    }
    post.content = nextContent;
  }

  if (req.body?.images != null) {
    const images = normalizeImages(req.body.images);
    if (images.length > 5) {
      return res
        .status(400)
        .json({ success: false, message: "images exceeds the limit of 5" });
    }
    post.images = images;
  }

  await post.save();
  const updated = post.toObject() as { userId: unknown };
  const updatedUser = await User.findById(updated.userId)
    .select("_id name username")
    .lean();
  return res
    .status(200)
    .json({
      success: true,
      message: "Post updated",
      data: { ...updated, user: (updatedUser as PostAuthor) ?? null },
    });
};

const remove = async (req: Request, res: Response) => {
  const user = getRequestUser(req);
  if (!user?._id)
    return res.status(401).json({ success: false, message: "Unauthorized" });

  const post = await Post.findById(req.params.id);
  if (!post)
    return res.status(404).json({ success: false, message: "Post not found" });

  // Owner-only deletion (unless admin).
  if (!isAdmin(user) && !isOwner(user, post.userId)) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }

  await post.deleteOne();
  return res.status(200).json({ success: true, message: "Post deleted" });
};

export const postControllers = {
  create,
  list,
  listByUser,
  listFriends,
  getById,
  update,
  remove,
};
