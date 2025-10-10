import mongoose, { Schema } from "mongoose";

export interface IFile {
  roomId: string;
  filename: string;
  language: string;
  content: string;
  version: number;
  lastEditedBy?: string;
  lastEditedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const FileSchema = new Schema(
  {
    roomId: { type: String, required: true },
    filename: { type: String, required: true },
    language: { type: String, default: "plaintext" },
    content: { type: String, default: "" },
    version: { type: Number, default: 1 },
    lastEditedBy: { type: String },
    lastEditedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Compound unique index ensures unique filename per room
try {
  FileSchema.index({ roomId: 1, filename: 1 }, { unique: true });
} catch {}

export const FileModel = (mongoose.models.File as any) || mongoose.model("File", FileSchema);
