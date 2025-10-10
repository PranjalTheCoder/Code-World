import session from "express-session";
import MongoStore from "connect-mongo";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function createSessionMiddleware() {
  if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is not set");
  }
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not set");
  }

  return session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: ONE_WEEK_MS,
      httpOnly: true,
      sameSite: "lax",
      secure: false, // set true behind HTTPS
    },
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      ttl: ONE_WEEK_MS / 1000, // seconds
      touchAfter: 24 * 3600, // lazy session update to reduce writes
      crypto: {
        secret: process.env.SESSION_SECRET,
      },
    }),
  });
}
