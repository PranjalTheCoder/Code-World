import mongoose, { Schema } from "mongoose";

export interface IUser {
  username: string;
  email?: string;
  passwordHash?: string;
  avatarUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    passwordHash: { type: String },
    avatarUrl: { type: String },
  },
  { timestamps: true }
);

UserSchema.index({ username: 1 }, { unique: true });
UserSchema.index({ email: 1 }, { unique: true, sparse: true });

export const UserModel = (mongoose.models.User as any) || mongoose.model("User", UserSchema);
