import session from "express-session";
import MongoStore from "connect-mongo";

const mongoUrl = process.env.MONGO_URI || "mongodb://localhost:27017/codeworld";
const sessionSecret = process.env.SESSION_SECRET || "change_me";

const sessionMiddleware = session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  },
  store: MongoStore.create({
    mongoUrl,
    stringify: false,
    autoRemove: "interval",
    autoRemoveInterval: 60 * 24, // every day
    touchAfter: 24 * 3600, // time period in seconds
  }),
});

export default sessionMiddleware;
