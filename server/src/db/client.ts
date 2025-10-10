import { PrismaClient } from "@prisma/client"

// Create a single Prisma client instance for the server process.
// Enable logging in development to see the queries.
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
})

export { prisma }
