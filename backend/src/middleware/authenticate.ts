import { NextFunction, Request, Response } from "express";
import { prisma } from "@database/prisma";
import { AppError } from "@utils/AppError";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; name: string };
    }
  }
}

/**
 * אימות פשוט לפי API key קבוע בכותרת X-API-Key - מתאים למשק בית סגור
 * (שני משתמשים) שמכניס את המפתח פעם אחת ב-Shortcut/בדפדפן, בלי לוגין מלא.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const apiKey = req.header("X-API-Key");
  if (!apiKey) {
    throw AppError.unauthorized("Missing X-API-Key header");
  }

  const user = await prisma.user.findUnique({ where: { apiKey } });
  if (!user) {
    throw AppError.unauthorized("Invalid API key");
  }

  req.user = { id: user.id, name: user.name };
  next();
}
