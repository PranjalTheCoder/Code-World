import mongoose from "mongoose";

export async function connectDB(uri: string): Promise<typeof mongoose | null> {
  try {
    mongoose.set("strictQuery", true);
    const conn = await mongoose.connect(uri);
    console.log(`MongoDB connected: ${conn.connection.host}`);
    return conn;
  } catch (err) {
    console.error("MongoDB connection error:", err);
    return null;
  }
}
