import mongoose, { Schema } from "mongoose";

export interface IMessage {
  roomId: string;
  senderUserId?: string;
  text: string;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema(
  {
    roomId: { type: String, required: true },
    senderUserId: { type: String },
    text: { type: String, required: true },
  },
  { timestamps: true }
);

MessageSchema.index({ roomId: 1, createdAt: 1 });

export const MessageModel = (mongoose.models.Message as any) || mongoose.model("Message", MessageSchema);
