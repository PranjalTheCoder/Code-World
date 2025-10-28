import mongoose, { Schema, Document, model } from "mongoose";

export interface MessageDocument extends Document {
  roomId: string;
  senderUserId?: string;
  text: string;
  createdAt: Date;
}

const MessageSchema = new Schema<MessageDocument>(
  {
    roomId: { type: String, required: true, index: true },
    senderUserId: { type: String },
    text: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

MessageSchema.index({ roomId: 1, createdAt: 1 });

export const Message =
  (mongoose.models.Message as mongoose.Model<MessageDocument>) ||
  model<MessageDocument>("Message", MessageSchema);
