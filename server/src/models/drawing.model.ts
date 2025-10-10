import mongoose from "mongoose";

export interface IDrawing {
  roomId: string;
  canvasState?: any;
  ops: any[];
  version: number;
  lastEditedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DrawingSchema = new mongoose.Schema(
  {
    roomId: { type: String, required: true },
    canvasState: { type: mongoose.Schema.Types.Mixed },
    ops: { type: [mongoose.Schema.Types.Mixed] as any, default: [] },
    version: { type: Number, default: 1 },
    lastEditedAt: { type: Date, default: Date.now },
  },
  { timestamps: true } as any
);

// unique index for roomId is managed as needed by application; avoid duplicates

export const DrawingModel = (mongoose.models.Drawing as any) || (mongoose.model("Drawing", DrawingSchema) as any);
