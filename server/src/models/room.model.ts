import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface RoomDocument extends Document {
  roomId: string;
  ownerUserId?: Types.ObjectId;
  title?: string;
  allowedUsers: Types.ObjectId[];
  files: Types.ObjectId[];
  fileTree?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const RoomSchema = new Schema<RoomDocument>(
  {
    roomId: { type: String, required: true, unique: true, index: true },
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User" },
    title: { type: String },
    allowedUsers: [{ type: Schema.Types.ObjectId, ref: "User" }],
    files: [{ type: Schema.Types.ObjectId, ref: "File" }],
    fileTree: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

RoomSchema.index({ roomId: 1 }, { unique: true });

export const Room: Model<RoomDocument> =
  mongoose.models.Room || mongoose.model<RoomDocument>("Room", RoomSchema);
