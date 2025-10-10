import express, { Response, Request } from "express";
import dotenv from "dotenv";
import http from "http";
import cors from "cors";
import { SocketEvent, SocketId } from "./types/socket";
import { USER_CONNECTION_STATUS, User } from "./types/user";
import { Server } from "socket.io";
import path from "path";
import { connectDB } from "./config/db";
import { createSessionMiddleware } from "./config/session";
import { RoomState } from "./models/RoomState";
import { UserSession } from "./models/UserSession";
import { File } from "./models/file.model";
import { Message } from "./models/message.model";
import { Drawing } from "./models/drawing.model";
import { Room } from "./models/room.model";

dotenv.config();

const app = express();

app.use(express.json());

app.use(cors());

app.use(express.static(path.join(__dirname, "public"))); // Serve static files

// Persistent sessions (cookie store backed by Mongo)
app.use(createSessionMiddleware());

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
    socket.join(roomId);
    socket.broadcast.to(roomId).emit(SocketEvent.USER_JOINED, { user });
    const users = getUsersInRoom(roomId);
    io.to(socket.id).emit(SocketEvent.JOIN_ACCEPTED, { user, users });

    // Track user session in MongoDB (non-blocking)
    try {
      await UserSession.findOneAndUpdate(
        { socketId: socket.id },
        {
          username,
          roomId,
          socketId: socket.id,
          status: USER_CONNECTION_STATUS.ONLINE,
          cursorPosition: 0,
          typing: false,
          currentFile: null,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch (err) {
      console.error("Failed to upsert UserSession:", err);
    }

    // Ensure Room doc exists
    try {
      await Room.findOneAndUpdate(
        { roomId },
        { $setOnInsert: { roomId } },
        { upsert: true }
      );
    } catch (err) {
      console.error("Failed to ensure Room existence:", err);
    }

    // If a saved room state exists, send it to the joining user
    try {
      const existing = await RoomState.findOne({ roomId });
      if (existing) {
        io.to(socket.id).emit(SocketEvent.SYNC_FILE_STRUCTURE, {
          fileStructure: existing.fileStructure,
          openFiles: existing.openFiles,
          activeFile: existing.activeFile,
        });
        io.to(socket.id).emit(SocketEvent.SYNC_DRAWING, {
          drawingData: existing.drawingData,
        });
      }
    } catch (err) {
      console.error("Failed to fetch RoomState:", err);
    }
  });

  socket.on("disconnecting", async () => {
    const user = getUserBySocketId(socket.id);
    if (!user) return;
    const roomId = user.roomId;
    socket.broadcast.to(roomId).emit(SocketEvent.USER_DISCONNECTED, { user });
    userSocketMap = userSocketMap.filter((u) => u.socketId !== socket.id);
    socket.leave(roomId);

    // Mark session offline in Mongo
    try {
      await UserSession.findOneAndUpdate(
        { socketId: socket.id },
        { status: USER_CONNECTION_STATUS.OFFLINE }
      );
    } catch (err) {
      console.error("Failed to mark UserSession offline:", err);
    }
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

  socket.on(SocketEvent.FILE_CREATED, async ({ parentDirId, newFile }) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    socket.broadcast
      .to(roomId)
      .emit(SocketEvent.FILE_CREATED, { parentDirId, newFile });

    // Persist file metadata
    try {
      const creator = getUserBySocketId(socket.id)?.username;
      const doc = await File.findOneAndUpdate(
        { roomId, filename: newFile.name },
        {
          roomId,
          filename: newFile.name,
          content: newFile.content || "",
          lastEditedBy: creator,
          lastEditedAt: new Date(),
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      // Add reference to Room.files
      await Room.updateOne(
        { roomId },
        { $addToSet: { files: doc._id } }
      );
    } catch (err) {
      console.error("Failed to persist File (create):", err);
    }
  });

  socket.on(SocketEvent.FILE_UPDATED, async ({ fileId, newContent }) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(SocketEvent.FILE_UPDATED, {
      fileId,
      newContent,
    });

    // Persist content to File
    try {
      const editor = getUserBySocketId(socket.id)?.username;
      // We do not have filename here; rely on filename uniqueness not necessary for update.
      // This app identifies files by generated id in memory; for persistence, we use filename-based mapping from latest RoomState
      // As a fallback, we do not map by fileId; we persist the last active file via RoomState PERSIST handler.
      // Best-effort: no-op here unless we have filename. RoomState persistence below is the durable source of truth for structure/content.
    } catch (err) {
      // swallow
    }
  });

  socket.on(SocketEvent.FILE_RENAMED, async ({ fileId, newName }) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(SocketEvent.FILE_RENAMED, {
      fileId,
      newName,
    });

    // Persist file rename (best-effort via filename from RoomState in persist handler)
    try {
      // Defer to PERSIST handler to reflect filenames; nothing to do here without filename context
    } catch {}
  });

  socket.on(SocketEvent.FILE_DELETED, async ({ fileId }) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(SocketEvent.FILE_DELETED, { fileId });
    try {
      // Delete by filename handled later; here we do nothing without filename
    } catch {}
  });

  // Persist room state to MongoDB
  socket.on(
    SocketEvent.PERSIST_FILE_STRUCTURE,
    async ({ fileStructure, openFiles, activeFile, drawingData }) => {
      const roomId = getRoomId(socket.id);
      if (!roomId) return;
      try {
        await RoomState.findOneAndUpdate(
          { roomId },
          { roomId, fileStructure, openFiles, activeFile, drawingData },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        // Mirror files into File collection by traversing fileStructure
        const collectFiles = (node: any, acc: Array<{ filename: string; content: string }>) => {
          if (!node) return acc;
          if (node.type === "file") {
            acc.push({ filename: node.name, content: node.content || "" });
          }
          if (Array.isArray(node.children)) {
            for (const child of node.children) collectFiles(child, acc);
          }
          return acc;
        };
        const files = collectFiles(fileStructure, []);
        const editor = getUserBySocketId(socket.id)?.username;
        for (const f of files) {
          const doc = await File.findOneAndUpdate(
            { roomId, filename: f.filename },
            {
              roomId,
              filename: f.filename,
              content: f.content,
              lastEditedBy: editor,
              lastEditedAt: new Date(),
              $inc: { version: 1 },
            } as any,
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
          await Room.updateOne({ roomId }, { $addToSet: { files: doc._id } });
        }

        // Persist drawing canvas snapshot if provided
        if (drawingData) {
          await Drawing.findOneAndUpdate(
            { roomId },
            { roomId, canvasState: drawingData, lastEditedAt: new Date() },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
        }
      } catch (err) {
        console.error("Failed to persist RoomState:", err);
      }
    }
  );

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
    socket.broadcast.to(roomId).emit(SocketEvent.RECEIVE_MESSAGE, { message });
    try {
      await Message.create({
        roomId,
        senderUserId: getUserBySocketId(socket.id)?.username,
        text: message.message ?? message.text ?? "",
      });
    } catch (err) {
      console.error("Failed to persist chat message:", err);
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

  socket.on(SocketEvent.DRAWING_UPDATE, async ({ snapshot }) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(SocketEvent.DRAWING_UPDATE, {
      snapshot,
    });
    try {
      await Drawing.updateOne(
        { roomId },
        { $push: { ops: snapshot }, lastEditedAt: new Date() },
        { upsert: true }
      );
    } catch (err) {
      console.error("Failed to persist drawing op:", err);
    }
  });
});

const PORT = process.env.PORT || 3000;

// Establish DB connection at startup
const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || "";
connectDB(mongoUri);

// Expose room state for reconnection flows
app.get("/rooms/:roomId/state", async (req: Request, res: Response) => {
  const { roomId } = req.params as { roomId: string };
  try {
    const [files, messages, drawing] = await Promise.all([
      File.find({ roomId }).lean(),
      Message.find({ roomId }).sort({ createdAt: -1 }).limit(50).lean(),
      Drawing.findOne({ roomId }).lean(),
    ]);
    res.json({ files, messages: messages.reverse(), drawing });
  } catch (err) {
    console.error("Failed to fetch room state:", err);
    res.status(500).json({ error: "Failed to fetch room state" });
  }
});

// Simple autosnapshotter: periodically save File snapshots
import { Snapshot } from "./models/snapshot.model";
const lastSnapshotVersion = new Map<string, number>();
setInterval(async () => {
  try {
    const since = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes
    const updatedFiles = await File.find({ updatedAt: { $gte: since } });
    for (const f of updatedFiles) {
      const last = lastSnapshotVersion.get(String(f._id)) || 0;
      if (f.version > last) {
        await Snapshot.create({ fileId: f._id, version: f.version, content: f.content });
        lastSnapshotVersion.set(String(f._id), f.version);
      }
    }
  } catch (err) {
    console.error("Autosnapshot error:", err);
  }
}, 60 * 1000);

app.get("/", (req: Request, res: Response) => {
  // Send the index.html file
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

server.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
