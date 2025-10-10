import mongoose, { Schema, Document, model, Types } from "mongoose";

export interface RoomDocument extends Document {
  roomId: string;
  ownerUserId?: Types.ObjectId;
  title?: string;
  allowedUsers: Types.ObjectId[];
  files: Types.ObjectId[];
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
  },
  { timestamps: true }
);

export const Room =
  (mongoose.models.Room as mongoose.Model<RoomDocument>) ||
  model<RoomDocument>("Room", RoomSchema);
