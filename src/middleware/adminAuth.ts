import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env";

export function requireAdminAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const key =
    (req.header("x-admin-key") ?? "").toString() ||
    (typeof req.query.key === "string" ? req.query.key : "");

  if (!env.ADMIN_API_KEY) {
    return res.status(500).json({ error: "ADMIN_API_KEY not configured" });
  }

  if (!key || key !== env.ADMIN_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  return next();
}

