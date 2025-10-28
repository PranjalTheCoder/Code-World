import mongoose, { Schema, Document, model } from "mongoose";

interface FileSystemItemDoc {
  id: string;
  name: string;
  type: "file" | "directory";
  children?: FileSystemItemDoc[];
  content?: string;
  isOpen?: boolean;
}

export interface RoomStateDocument extends Document {
  roomId: string;
  fileStructure: FileSystemItemDoc;
  openFiles: FileSystemItemDoc[];
  activeFile: FileSystemItemDoc | null;
  drawingData: unknown | null;
  updatedAt: Date;
}

const FileSystemItemSchema = new Schema<FileSystemItemDoc>({
  id: { type: String, required: true },
  name: { type: String, required: true },
  type: { type: String, enum: ["file", "directory"], required: true },
  children: { type: [Schema.Types.Mixed], default: undefined },
  content: { type: String },
  isOpen: { type: Boolean },
});

const RoomStateSchema = new Schema<RoomStateDocument>(
  {
    roomId: { type: String, required: true, index: true, unique: true },
    fileStructure: { type: FileSystemItemSchema, required: true },
    openFiles: { type: [FileSystemItemSchema], default: [] },
    activeFile: { type: FileSystemItemSchema, default: null },
    drawingData: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

export const RoomState =
  (mongoose.models.RoomState as mongoose.Model<RoomStateDocument>) ||
  model<RoomStateDocument>("RoomState", RoomStateSchema);
