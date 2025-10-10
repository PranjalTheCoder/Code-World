import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface FileDocument extends Document {
  roomId: Types.ObjectId;
  fileId: string; // client-side UUID
  filename: string;
  language?: string;
  content: string;
  version: number;
  lastEditedBy?: Types.ObjectId;
  lastEditedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const FileSchema = new Schema<FileDocument>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: "Room", required: true, index: true },
    fileId: { type: String, required: true },
    filename: { type: String, required: true },
    language: { type: String },
    content: { type: String, required: true, default: "" },
    version: { type: Number, required: true, default: 1 },
    lastEditedBy: { type: Schema.Types.ObjectId, ref: "User" },
    lastEditedAt: { type: Date },
  },
  { timestamps: true }
);

FileSchema.index({ roomId: 1, fileId: 1 }, { unique: true });
FileSchema.index({ roomId: 1, filename: 1 });

export const FileModel: Model<FileDocument> =
  mongoose.models.File || mongoose.model<FileDocument>("File", FileSchema);
