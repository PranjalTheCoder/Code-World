import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface MessageDocument extends Document {
  roomId: Types.ObjectId;
  senderUserId?: Types.ObjectId;
  text: string;
  createdAt: Date;
}

const MessageSchema = new Schema<MessageDocument>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: "Room", required: true, index: true },
    senderUserId: { type: Schema.Types.ObjectId, ref: "User" },
    text: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

MessageSchema.index({ roomId: 1, createdAt: 1 });

export const Message: Model<MessageDocument> =
  mongoose.models.Message || mongoose.model<MessageDocument>("Message", MessageSchema);
