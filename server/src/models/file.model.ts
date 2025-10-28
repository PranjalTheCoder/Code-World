import mongoose, { Schema, Document, model } from "mongoose";

export interface FileDocument extends Document {
  roomId: string;
  filename: string;
  language?: string;
  content: string;
  version: number;
  lastEditedBy?: string;
  lastEditedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const FileSchema = new Schema<FileDocument>(
  {
    roomId: { type: String, required: true, index: true },
    filename: { type: String, required: true },
    language: { type: String },
    content: { type: String, default: "" },
    version: { type: Number, default: 1 },
    lastEditedBy: { type: String },
    lastEditedAt: { type: Date },
  },
  { timestamps: true }
);

FileSchema.index({ roomId: 1, filename: 1 }, { unique: true });

export const File =
  (mongoose.models.File as mongoose.Model<FileDocument>) ||
  model<FileDocument>("File", FileSchema);
