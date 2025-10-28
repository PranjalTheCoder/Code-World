import mongoose, { Schema, Document, model, Types } from "mongoose";

export interface SnapshotDocument extends Document {
  fileId: Types.ObjectId;
  version: number;
  content: string;
  createdAt: Date;
}

const SnapshotSchema = new Schema<SnapshotDocument>(
  {
    fileId: { type: Schema.Types.ObjectId, ref: "File", required: true, index: true },
    version: { type: Number, required: true },
    content: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

SnapshotSchema.index({ fileId: 1, version: 1 }, { unique: true });

export const Snapshot =
  (mongoose.models.Snapshot as mongoose.Model<SnapshotDocument>) ||
  model<SnapshotDocument>("Snapshot", SnapshotSchema);
