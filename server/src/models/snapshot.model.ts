import mongoose, { Schema, Types } from "mongoose";

export interface ISnapshot {
  fileId: Types.ObjectId;
  version: number;
  content: string;
  createdAt: Date;
}

const SnapshotSchema = new Schema(
  {
    fileId: { type: Schema.Types.ObjectId, ref: "File", required: true, index: true },
    version: { type: Number, required: true },
    content: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

SnapshotSchema.index({ fileId: 1, version: 1 }, { unique: true });

export const SnapshotModel = (mongoose.models.Snapshot as any) || mongoose.model("Snapshot", SnapshotSchema);
