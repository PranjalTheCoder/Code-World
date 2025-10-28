import mongoose, { Schema, Document, model } from "mongoose";

export interface UserDocument extends Document {
  username: string;
  email: string;
  passwordHash: string;
  avatarUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<UserDocument>(
  {
    username: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    avatarUrl: { type: String },
  },
  { timestamps: true }
);

export const User =
  (mongoose.models.User as mongoose.Model<UserDocument>) ||
  model<UserDocument>("User", UserSchema);
