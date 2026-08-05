import type { NextFunction, Request, Response } from "express";
import { config } from "./config.js";
import { findUserById, type AuthUser } from "./db.js";

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

declare global {
  // Express requires namespace augmentation for request-scoped authenticated users.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!req.session.userId) {
    res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });
    return;
  }
  const user = await findUserById(req.session.userId);
  if (!user) {
    req.session.destroy(() => undefined);
    res.status(401).json({ error: "SESSION_USER_NOT_FOUND" });
    return;
  }
  req.authUser = user;
  next();
}

export function requireActive(req: Request, res: Response, next: NextFunction) {
  const user = req.authUser;
  if (!user) {
    res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });
    return;
  }
  if (user.accessStatus !== "active") {
    res.status(403).json({ error: "ACCOUNT_ACCESS_PENDING" });
    return;
  }
  next();
}

export function requireRole(...roles: AuthUser["role"][]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.authUser;
    if (!user) {
      res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });
      return;
    }
    if (!user.isAdmin && !roles.includes(user.role)) {
      res.status(403).json({ error: "ROLE_NOT_AUTHORIZED" });
      return;
    }
    next();
  };
}

export function requireSameOrigin(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const origin = req.get("origin");
  if (origin) {
    try {
      if (config.allowedOrigins.includes(new URL(origin).origin)) {
        next();
        return;
      }
    } catch {
      // Malformed origins are rejected below.
    }
  }
  res.status(403).json({ error: "ORIGIN_NOT_ALLOWED" });
}
