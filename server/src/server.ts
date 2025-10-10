import express, { Response, Request } from "express";
import dotenv from "dotenv";
import http from "http";
import cors from "cors";
import { SocketEvent, SocketId } from "./types/socket";
import { USER_CONNECTION_STATUS, User } from "./types/user";
import { Server } from "socket.io";
import path from "path";
import { RoomModel } from "./models/room.model";
import { FileModel } from "./models/file.model";
import { MessageModel } from "./models/message.model";
import { DrawingModel } from "./models/drawing.model";
import { SnapshotModel } from "./models/snapshot.model";
import connectDB from "./config/db";
import sessionMiddleware from "./config/session";

dotenv.config();

const app = express();

app.use(express.json());

app.use(cors());

// Session middleware (backed by MongoDB)
app.use(sessionMiddleware);

app.use(express.static(path.join(__dirname, "public"))); // Serve static files

// Initialize DB connection
connectDB().catch((err) => {
  console.error("Failed to connect to MongoDB during startup", err);
  process.exit(1);
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
  maxHttpBufferSize: 1e8,
  pingTimeout: 60000,
});

// Share express-session with Socket.IO (Engine.IO layer)
io.engine.use(sessionMiddleware as any);

let userSocketMap: User[] = [];

// Autosave snapshots of files every 30 seconds per room
setInterval(async (): Promise<void> => {
  try {
    // Snapshot last versions of files
    const files = await FileModel.find({}).select("_id version content").lean();
    await Promise.all(
      files.map(async (f: { _id: any; version: number; content: string }) => {
        try {
          await SnapshotModel.updateOne(
            { fileId: f._id, version: f.version },
            { $setOnInsert: { fileId: f._id, version: f.version, content: f.content } },
            { upsert: true }
          );
        } catch (e) {
          // swallow duplicates
        }
      })
    );
  } catch (err) {
    console.error("Autosave snapshots failed:", err);
  }
}, 30_000);

// Function to get all users in a room
function getUsersInRoom(roomId: string): User[] {
  return userSocketMap.filter((user) => user.roomId == roomId);
}

// Function to get room id by socket id
function getRoomId(socketId: SocketId): string | null {
  const roomId = userSocketMap.find(
    (user) => user.socketId === socketId
  )?.roomId;

  if (!roomId) {
    console.error("Room ID is undefined for socket ID:", socketId);
    return null;
  }
  return roomId;
}

function getUserBySocketId(socketId: SocketId): User | null {
  const user = userSocketMap.find((user) => user.socketId === socketId);
  if (!user) {
    console.error("User not found for socket ID:", socketId);
    return null;
  }
  return user;
}

io.on("connection", (socket) => {
  // Handle user actions
  socket.on(SocketEvent.JOIN_REQUEST, ({ roomId, username }) => {
    // Check is username exist in the room
    const isUsernameExist = getUsersInRoom(roomId).filter(
      (u) => u.username === username
    );
    if (isUsernameExist.length > 0) {
      io.to(socket.id).emit(SocketEvent.USERNAME_EXISTS);
      return;
    }

    const user = {
      username,
      roomId,
      status: USER_CONNECTION_STATUS.ONLINE,
      cursorPosition: 0,
      typing: false,
      socketId: socket.id,
      currentFile: null,
    };
    userSocketMap.push(user);
    socket.join(roomId);
    socket.broadcast.to(roomId).emit(SocketEvent.USER_JOINED, { user });
    const users = getUsersInRoom(roomId);
    io.to(socket.id).emit(SocketEvent.JOIN_ACCEPTED, { user, users });

    // Load latest room state from DB and send to the new client
    (async () => {
      try {
        const room = await RoomModel.findOneAndUpdate(
          { roomId },
          { $setOnInsert: { roomId } },
          { upsert: true, new: true }
        ).lean();

        const files = await FileModel.find({ roomId }).lean();
        const messages = await MessageModel.find({ roomId })
          .sort({ createdAt: -1 })
          .limit(50)
          .lean();
        const drawing = await DrawingModel.findOne({ roomId }).lean();

        io.to(socket.id).emit(SocketEvent.ROOM_STATE, {
          room,
          files,
          messages: messages.reverse(),
          drawing,
        });
      } catch (err) {
        console.error("Failed to load room state:", err);
      }
    })();
  });

  socket.on("disconnecting", () => {
    const user = getUserBySocketId(socket.id);
    if (!user) return;
    const roomId = user.roomId;
    socket.broadcast.to(roomId).emit(SocketEvent.USER_DISCONNECTED, { user });
    userSocketMap = userSocketMap.filter((u) => u.socketId !== socket.id);
    socket.leave(roomId);
  });

  // Handle file actions
  socket.on(
    SocketEvent.SYNC_FILE_STRUCTURE,
    ({ fileStructure, openFiles, activeFile, socketId }) => {
      io.to(socketId).emit(SocketEvent.SYNC_FILE_STRUCTURE, {
        fileStructure,
        openFiles,
        activeFile,
      });
    }
  );

  socket.on(SocketEvent.DIRECTORY_CREATED, ({ parentDirId, newDirectory }) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(SocketEvent.DIRECTORY_CREATED, {
      parentDirId,
      newDirectory,
    });
  });

  socket.on(SocketEvent.DIRECTORY_UPDATED, ({ dirId, children }) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(SocketEvent.DIRECTORY_UPDATED, {
      dirId,
      children,
    });
  });

  socket.on(SocketEvent.DIRECTORY_RENAMED, ({ dirId, newName }) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(SocketEvent.DIRECTORY_RENAMED, {
      dirId,
      newName,
    });
  });

  socket.on(SocketEvent.DIRECTORY_DELETED, ({ dirId }) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(SocketEvent.DIRECTORY_DELETED, { dirId });
  });

  socket.on(SocketEvent.FILE_CREATED, ({ parentDirId, newFile }) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    socket.broadcast
      .to(roomId)
      .emit(SocketEvent.FILE_CREATED, { parentDirId, newFile });
    // Persist file creation
    (async () => {
      try {
        await FileModel.updateOne(
          { roomId, filename: newFile.name || newFile.filename },
          {
            $setOnInsert: {
              roomId,
              filename: newFile.name || newFile.filename,
              language: newFile.language || "plaintext",
              content: newFile.content || "",
              version: 1,
              lastEditedBy: usernameFromSocket(socket.id),
              lastEditedAt: new Date(),
            },
          },
          { upsert: true }
        );
      } catch (err) {
        console.error("Failed to persist file creation:", err);
      }
    })();
  });

  socket.on(SocketEvent.FILE_UPDATED, ({ fileId, newContent }) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(SocketEvent.FILE_UPDATED, {
      fileId,
      newContent,
    });
    // Persist file content
    (async () => {
      try {
        const filename = fileId; // assuming fileId is filename in current protocol
        await FileModel.updateOne(
          { roomId, filename },
          {
            $set: {
              content: newContent,
              lastEditedBy: usernameFromSocket(socket.id) || undefined,
              lastEditedAt: new Date(),
            },
            $inc: { version: 1 },
          },
          { upsert: true }
        );
      } catch (err) {
        console.error("Failed to persist file update:", err);
      }
    })();
  });

  socket.on(SocketEvent.FILE_RENAMED, ({ fileId, newName }) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(SocketEvent.FILE_RENAMED, {
      fileId,
      newName,
    });
    (async () => {
      try {
        await FileModel.updateOne(
          { roomId, filename: fileId },
          { $set: { filename: newName } }
        );
      } catch (err) {
        console.error("Failed to persist file rename:", err);
      }
    })();
  });

  socket.on(SocketEvent.FILE_DELETED, ({ fileId }) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(SocketEvent.FILE_DELETED, { fileId });
    (async () => {
      try {
        await FileModel.deleteOne({ roomId, filename: fileId });
      } catch (err) {
        console.error("Failed to persist file deletion:", err);
      }
    })();
  });

  // Handle user status
  socket.on(SocketEvent.USER_OFFLINE, ({ socketId }) => {
    userSocketMap = userSocketMap.map((user) => {
      if (user.socketId === socketId) {
        return { ...user, status: USER_CONNECTION_STATUS.OFFLINE };
      }
      return user;
    });
    const roomId = getRoomId(socketId);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(SocketEvent.USER_OFFLINE, { socketId });
  });

  socket.on(SocketEvent.USER_ONLINE, ({ socketId }) => {
    userSocketMap = userSocketMap.map((user) => {
      if (user.socketId === socketId) {
        return { ...user, status: USER_CONNECTION_STATUS.ONLINE };
      }
      return user;
    });
    const roomId = getRoomId(socketId);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(SocketEvent.USER_ONLINE, { socketId });
  });

  // Handle chat actions
  socket.on(SocketEvent.SEND_MESSAGE, ({ message }) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(SocketEvent.RECEIVE_MESSAGE, { message });
    (async () => {
      try {
        await MessageModel.create({
          roomId,
          senderUserId: getUserBySocketId(socket.id)?.username,
          text: message?.text ?? message,
        });
      } catch (err) {
        console.error("Failed to persist chat message:", err);
      }
    })();
  });

  // Handle cursor position
  socket.on(SocketEvent.TYPING_START, ({ cursorPosition }) => {
    userSocketMap = userSocketMap.map((user) => {
      if (user.socketId === socket.id) {
        return { ...user, typing: true, cursorPosition };
      }
      return user;
    });
    const user = getUserBySocketId(socket.id);
    if (!user) return;
    const roomId = user.roomId;
    socket.broadcast.to(roomId).emit(SocketEvent.TYPING_START, { user });
  });

  socket.on(SocketEvent.TYPING_PAUSE, () => {
    userSocketMap = userSocketMap.map((user) => {
      if (user.socketId === socket.id) {
        return { ...user, typing: false };
      }
      return user;
    });
    const user = getUserBySocketId(socket.id);
    if (!user) return;
    const roomId = user.roomId;
    socket.broadcast.to(roomId).emit(SocketEvent.TYPING_PAUSE, { user });
  });

  socket.on(SocketEvent.REQUEST_DRAWING, () => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    socket.broadcast
      .to(roomId)
      .emit(SocketEvent.REQUEST_DRAWING, { socketId: socket.id });
  });

  socket.on(SocketEvent.SYNC_DRAWING, ({ drawingData, socketId }) => {
    socket.broadcast
      .to(socketId)
      .emit(SocketEvent.SYNC_DRAWING, { drawingData });
  });

  socket.on(SocketEvent.DRAWING_UPDATE, ({ snapshot }) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(SocketEvent.DRAWING_UPDATE, {
      snapshot,
    });
    (async () => {
      try {
        await DrawingModel.updateOne(
          { roomId },
          {
            $set: {
              canvasState: snapshot?.canvasState,
              lastEditedAt: new Date(),
            },
            $push: { ops: { $each: snapshot?.ops ?? [], $slice: -500 } },
            $inc: { version: 1 },
          },
          { upsert: true }
        );
      } catch (err) {
        console.error("Failed to persist drawing update:", err);
      }
    })();
  });
  
  socket.on("disconnect", async () => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    const members = getUsersInRoom(roomId);
    if (members.length === 0) {
      try {
        // Could trigger any finalization logic if needed
        await RoomModel.updateOne({ roomId }, { $set: { updatedAt: new Date() } }, { upsert: true });
      } catch (err) {
        console.error("Failed to finalize room on disconnect:", err);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;

app.get("/", (req: Request, res: Response) => {
  // Send the index.html file
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

// Restore route: returns room state for reconnects
app.get("/rooms/:roomId/state", async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const room = await RoomModel.findOne({ roomId }).lean();
    const files = await FileModel.find({ roomId }).lean();
    const messages = await MessageModel.find({ roomId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    const drawing = await DrawingModel.findOne({ roomId }).lean();

    res.json({
      room,
      files,
      messages: messages.reverse(),
      drawing,
    });
  } catch (err) {
    console.error("Failed to fetch room state:", err);
    res.status(500).json({ error: "Failed to fetch room state" });
  }
});

server.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});

function usernameFromSocket(socketId: string): string | undefined {
  return getUserBySocketId(socketId)?.username ?? undefined;
}
