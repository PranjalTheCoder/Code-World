import session from "express-session";
import MongoStore from "connect-mongo";

export function createSessionMiddleware() {
  const mongoUrl = process.env.MONGO_URI as string;
  const secret = process.env.SESSION_SECRET as string;

  if (!mongoUrl) {
    console.warn("MONGO_URI not set; session store will not be persistent.");
  }
  if (!secret) {
    console.warn("SESSION_SECRET not set; using insecure default for development.");
  }

  return session({
    secret: secret || "dev_insecure_secret_change_me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000, // ~7 days
      httpOnly: true,
      sameSite: "lax",
      secure: false, // set true behind HTTPS
    },
    store: mongoUrl
      ? MongoStore.create({
          mongoUrl,
          ttl: 14 * 24 * 60 * 60, // 14 days
        })
      : undefined,
  });
}
