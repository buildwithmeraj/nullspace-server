import type { Server as HttpServer } from "http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import config from "./config";

export type SocketUser = { id: string };

let io: Server | null = null;

export function userRoom(userId: string) {
  return `user:${userId}`;
}

export function initSocket(server: HttpServer) {
  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL ?? "http://localhost:3000",
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const authToken = socket.handshake.auth?.token;
    const headerToken =
      typeof socket.handshake.headers.authorization === "string"
        ? socket.handshake.headers.authorization.split(" ")[1]
        : undefined;
    const token =
      typeof authToken === "string" && authToken.trim()
        ? authToken.trim()
        : headerToken;

    if (!token) return next(new Error("Unauthorized"));

    try {
      const decoded = jwt.verify(token, config.jwt_secret!) as { id: string };
      (socket.data as { user?: SocketUser }).user = { id: decoded.id };
      return next();
    } catch {
      return next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const uid = (socket.data as { user?: SocketUser }).user?.id;
    if (uid) socket.join(userRoom(uid));

    socket.on("disconnect", () => {
      // no-op: socket.io removes from rooms automatically
    });
  });

  return io;
}

export function getIo() {
  return io;
}

