import mongoose from "mongoose";

export async function connectMongo(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.warn(
      "MONGODB_URI is not set. Skipping MongoDB connection; persistence will be disabled."
    );
    return;
  }

  try {
    await mongoose.connect(mongoUri, {
      dbName: process.env.MONGODB_DB || undefined,
    });
    console.log("Connected to MongoDB");
  } catch (err) {
    console.error("MongoDB connection error:", err);
  }
}
