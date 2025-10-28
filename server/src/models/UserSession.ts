import mongoose, { Schema, Document, model } from "mongoose";

export interface UserSessionDocument extends Document {
  username: string;
  roomId: string;
  socketId: string;
  status: "offline" | "online";
  cursorPosition: number;
  typing: boolean;
  currentFile: string | null;
  updatedAt: Date;
}

const UserSessionSchema = new Schema<UserSessionDocument>(
  {
    username: { type: String, required: true },
    roomId: { type: String, required: true, index: true },
    socketId: { type: String, required: true, unique: true },
    status: { type: String, enum: ["offline", "online"], required: true },
    cursorPosition: { type: Number, default: 0 },
    typing: { type: Boolean, default: false },
    currentFile: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

UserSessionSchema.index({ roomId: 1, username: 1 });

export const UserSession =
  (mongoose.models.UserSession as mongoose.Model<UserSessionDocument>) ||
  model<UserSessionDocument>("UserSession", UserSessionSchema);
