import { PrismaClient } from "@prisma/client";

// Singleton בודד ל-Prisma Client - נמנעים מלפתוח חיבור חדש לכל import.
export const prisma = new PrismaClient();
