import mongoose, { Schema, Types } from "mongoose";

export interface IRoom {
  roomId: string;
  ownerUserId?: Types.ObjectId;
  title?: string;
  allowedUsers: Types.ObjectId[];
  files: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const RoomSchema = new Schema(
  {
    roomId: { type: String, required: true, unique: true },
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User" },
    title: { type: String },
    allowedUsers: [{ type: Schema.Types.ObjectId, ref: "User" }],
    files: [{ type: Schema.Types.ObjectId, ref: "File" }],
  },
  { timestamps: true }
);

// unique index for roomId is already created via field option

export const RoomModel = (mongoose.models.Room as any) || mongoose.model("Room", RoomSchema);
