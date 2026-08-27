import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "@utils/AppError";

interface BodyParserError {
  type?: unknown;
}

function bodyParserErrorType(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const { type } = err as BodyParserError;
  return typeof type === "string" ? type : undefined;
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const parserErrorType = bodyParserErrorType(err);
  if (parserErrorType === "entity.parse.failed") {
    res.status(400).json({
      error: { code: "BAD_REQUEST", message: "Malformed JSON request body" },
    });
    return;
  }

  if (parserErrorType === "entity.too.large") {
    res.status(413).json({
      error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Invalid request data", details: err.flatten() },
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
    return;
  }

  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again later." },
  });
}
