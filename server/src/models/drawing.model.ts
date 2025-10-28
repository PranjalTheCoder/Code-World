import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface DrawingDocument extends Document {
  roomId: Types.ObjectId;
  canvasState?: Record<string, unknown>;
  ops?: unknown[];
  version: number;
  lastEditedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DrawingSchema = new Schema<DrawingDocument>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: "Room", required: true, index: true },
    canvasState: { type: Schema.Types.Mixed },
    ops: { type: [Schema.Types.Mixed], default: [] },
    version: { type: Number, required: true, default: 1 },
    lastEditedAt: { type: Date },
  },
  { timestamps: true }
);

export const Drawing: Model<DrawingDocument> =
  mongoose.models.Drawing || mongoose.model<DrawingDocument>("Drawing", DrawingSchema);
