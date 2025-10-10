import mongoose from "mongoose";

export async function connectToDatabase(uri: string): Promise<void> {
  mongoose.set("strictQuery", true);

  try {
    await mongoose.connect(uri, {
      // Additional options can be set here if needed
    });
    const { connection } = mongoose;
    console.log(`MongoDB connected: ${connection.host}/${connection.name}`);

    connection.on("error", (err) => {
      console.error("MongoDB connection error:", err);
    });
    connection.on("disconnected", () => {
      console.warn("MongoDB disconnected");
    });
  } catch (error) {
    console.error("MongoDB connection failed:", error);
    throw error;
  }
}
