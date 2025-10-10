import express, { Response, Request } from "express";
import dotenv from "dotenv";
import http from "http";
import cors from "cors";
import { SocketEvent, SocketId } from "./types/socket";
import { USER_CONNECTION_STATUS, User } from "./types/user";
import { Server } from "socket.io";
import path from "path";
import { connectToDatabase } from "./config/db";
import { createSessionMiddleware } from "./config/session";
import { Room } from "./models/room.model";
import { Message } from "./models/message.model";
import { FileModel } from "./models/file.model";
import { Drawing } from "./models/drawing.model";
import { Snapshot } from "./models/snapshot.model";

dotenv.config();

const app = express();

app.use(express.json());
app.use(cors());
// Apply sessions early, before routes and sockets
app.use(createSessionMiddleware());

app.use(express.static(path.join(__dirname, "public"))); // Serve static files

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
  maxHttpBufferSize: 1e8,
  pingTimeout: 60000,
});

let userSocketMap: User[] = [];

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
  socket.on(SocketEvent.JOIN_REQUEST, async ({ roomId, username }) => {
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
    // Ensure Room exists (best-effort)
    try {
      await Room.updateOne(
        { roomId },
        { $setOnInsert: { roomId, title: roomId } },
        { upsert: true }
      );
    } catch (err) {
      console.error("Failed to upsert room", err);
    }
    socket.join(roomId);
    socket.broadcast.to(roomId).emit(SocketEvent.USER_JOINED, { user });
    const users = getUsersInRoom(roomId);
    io.to(socket.id).emit(SocketEvent.JOIN_ACCEPTED, { user, users });
    // If we have persisted room state, send it to the joining client
    try {
      const persisted = await Room.findOne({ roomId }).lean();
      if (persisted && persisted.fileTree) {
        io.to(socket.id).emit(SocketEvent.SYNC_FILE_STRUCTURE, {
          fileStructure: persisted.fileTree,
          openFiles: [],
          activeFile: null,
        });
      }
    } catch (err) {
      console.error("Failed to send persisted room state", err);
    }
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
    async ({ fileStructure, openFiles, activeFile, socketId }) => {
      const roomId = getRoomId(socket.id);
      if (roomId) {
        try {
          await Room.updateOne({ roomId }, { $set: { fileTree: fileStructure } });
        } catch (err) {
          console.error("Failed to persist file tree", err);
        }
      }
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
    // Also update fileTree minimalistically
    // We rely on full SYNC_FILE_STRUCTURE for accurate persistence
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

  socket.on(SocketEvent.FILE_CREATED, async ({ parentDirId, newFile }) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    socket.broadcast
      .to(roomId)
      .emit(SocketEvent.FILE_CREATED, { parentDirId, newFile });
    try {
      const room = await Room.findOne({ roomId });
      if (room) {
        await FileModel.updateOne(
          { roomId: room._id, fileId: newFile.id },
          {
            $setOnInsert: {
              filename: newFile.name,
              content: newFile.content ?? "",
              language: undefined,
              version: 1,
            },
          },
          { upsert: true }
        );
      }
    } catch (err) {
      console.error("Failed to persist new file", err);
    }
  });

  socket.on(SocketEvent.FILE_UPDATED, async ({ fileId, newContent }) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(SocketEvent.FILE_UPDATED, {
      fileId,
      newContent,
    });
    try {
      const room = await Room.findOne({ roomId });
      if (room) {
        const result = await FileModel.findOneAndUpdate(
          { roomId: room._id, fileId },
          {
            $set: {
              content: newContent,
              lastEditedAt: new Date(),
            },
            $inc: { version: 1 },
          },
          { upsert: true, new: true }
        );
        // Periodically snapshot every 20 versions
        const version = result?.version ?? 0;
        if (version % 20 === 0 && version > 0) {
          await Snapshot.updateOne(
            { fileId: result!._id, version },
            { $setOnInsert: { content: newContent } },
            { upsert: true }
          );
        }
      }
    } catch (err) {
      console.error("Failed to persist file", err);
    }
  });

  socket.on(SocketEvent.FILE_RENAMED, async ({ fileId, newName }) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(SocketEvent.FILE_RENAMED, {
      fileId,
      newName,
    });
    try {
      const room = await Room.findOne({ roomId });
      if (room) {
        await FileModel.updateOne(
          { roomId: room._id, fileId },
          { $set: { filename: newName } }
        );
      }
    } catch (err) {
      console.error("Failed to rename file in DB", err);
    }
  });

  socket.on(SocketEvent.FILE_DELETED, async ({ fileId }) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(SocketEvent.FILE_DELETED, { fileId });
    try {
      const room = await Room.findOne({ roomId });
      if (room) {
        await FileModel.deleteOne({ roomId: room._id, fileId });
      }
    } catch (err) {
      console.error("Failed to delete file in DB", err);
    }
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
  socket.on(SocketEvent.SEND_MESSAGE, async ({ message }) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    // Broadcast to room
    socket.broadcast.to(roomId).emit(SocketEvent.RECEIVE_MESSAGE, { message });
    // Persist to database (best-effort)
    try {
      const room = await Room.findOne({ roomId });
      if (room) {
        await Message.create({
          roomId: room._id,
          text: message.message,
          createdAt: new Date(),
        });
      }
    } catch (err) {
      console.error("Failed to persist message", err);
    }
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
    // Persist latest drawing state
    void (async () => {
      try {
        const room = await Room.findOne({ roomId });
        if (!room) return;
        await Drawing.updateOne(
          { roomId: room._id },
          {
            $set: {
              canvasState: snapshot,
              lastEditedAt: new Date(),
            },
            $inc: { version: 1 },
          },
          { upsert: true }
        );
      } catch (err) {
        console.error("Failed to persist drawing", err);
      }
    })();
  });
});

const PORT = process.env.PORT || 3000;

app.get("/", (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

// Get full room state for reconnects
app.get("/rooms/:code/state", async (req: Request, res: Response) => {
  try {
    const { code } = req.params;
    const room = await Room.findOne({ roomId: code }).lean();
    if (!room) return res.json({ files: [], messages: [], drawing: null, fileTree: null });

    const [files, messages, drawing] = await Promise.all([
      FileModel.find({ roomId: room._id }).lean(),
      Message.find({ roomId: room._id }).sort({ createdAt: 1 }).limit(200).lean(),
      Drawing.findOne({ roomId: room._id }).lean(),
    ]);

    res.json({
      fileTree: room.fileTree ?? null,
      files: files.map((f) => ({
        id: String(f._id),
        filename: f.filename,
        language: f.language,
        content: f.content,
        version: f.version,
        lastEditedAt: f.lastEditedAt ? new Date(f.lastEditedAt).toISOString() : null,
      })),
      messages: messages.map((m) => ({
        id: String(m._id),
        message: m.text,
        username: "",
        timestamp: new Date(m.createdAt!).toISOString(),
      })),
      drawing: drawing?.canvasState ?? null,
    });
  } catch (err) {
    console.error("Failed to fetch room state", err);
    res.status(500).json({ error: "Failed to fetch room state" });
  }
});

server.listen(PORT, async () => {
  try {
    await connectToDatabase(process.env.MONGO_URI as string);
    console.log("Database connected");
  } catch (err) {
    console.error("Database connection failed", err);
  }
  console.log(`Listening on port ${PORT}`);
});
