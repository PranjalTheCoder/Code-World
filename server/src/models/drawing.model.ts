import mongoose, { Schema, Document, model } from "mongoose";

export interface DrawingDocument extends Document {
  roomId: string;
  canvasState: unknown;
  ops: unknown[];
  version: number;
  lastEditedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DrawingSchema = new Schema<DrawingDocument>(
  {
    roomId: { type: String, required: true, unique: true, index: true },
    canvasState: { type: Schema.Types.Mixed, default: null },
    ops: { type: [Schema.Types.Mixed], default: [] },
    version: { type: Number, default: 1 },
    lastEditedAt: { type: Date },
  },
  { timestamps: true }
);

export const Drawing =
  (mongoose.models.Drawing as mongoose.Model<DrawingDocument>) ||
  model<DrawingDocument>("Drawing", DrawingSchema);
