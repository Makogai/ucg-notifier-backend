import type { NextFunction, Request, Response } from "express";
import { AppError } from "./AppError";
import { logError } from "../utils/logger";

export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
    });
  }

  logError("Unhandled error", err);
  return res.status(500).json({
    error: "Internal server error",
  });
}

