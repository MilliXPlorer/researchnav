import { Router } from "express";
import rateLimit from "express-rate-limit";
import { OAuth2Client } from "google-auth-library";
import { z } from "zod";
import {
  requireActive,
  requireAuth,
  requireRole,
  requireSameOrigin,
} from "./auth.js";
import { config } from "./config.js";
import {
  listProvisionedUsers,
  provisionUser,
  resolveGoogleUser,
  toSession,
} from "./db.js";
import { sendRoleInvitation } from "./email.js";

const googleClient = new OAuth2Client(config.googleClientId);
const credentialSchema = z.object({ credential: z.string().min(1) });
const invitationSchema = z.object({
  email: z.email().transform((email) => email.toLowerCase()),
});

function regenerateSession(req: Express.Request) {
  return new Promise<void>((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}

function saveSession(req: Express.Request) {
  return new Promise<void>((resolve, reject) => {
    req.session.save((error) => (error ? reject(error) : resolve()));
  });
}

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

apiRouter.post(
  "/auth/google",
  requireSameOrigin,
  rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: "draft-8" }),
  async (req, res) => {
    const input = credentialSchema.parse(req.body);
    const ticket = await googleClient.verifyIdToken({
      idToken: input.credential,
      audience: config.googleClientId,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      res.status(401).json({ error: "GOOGLE_EMAIL_NOT_VERIFIED" });
      return;
    }

    const user = await resolveGoogleUser(payload.email, payload.sub);
    await regenerateSession(req);
    req.session.userId = user.id;
    await saveSession(req);
    res.json({ user: toSession(user) });
  },
);

apiRouter.get("/auth/session", requireAuth, (req, res) => {
  res.json({ user: toSession(req.authUser!) });
});

apiRouter.post("/auth/logout", requireSameOrigin, requireAuth, (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      res.status(500).json({ error: "LOGOUT_FAILED" });
      return;
    }
    res.clearCookie("researchnav.sid");
    res.status(204).end();
  });
});

apiRouter.get(
  "/admin/coordinators",
  requireAuth,
  requireActive,
  requireRole("admin"),
  async (_req, res) => {
    const users = await listProvisionedUsers("coordinator");
    res.json({ users: users.map(toSession) });
  },
);

apiRouter.post(
  "/admin/coordinators",
  requireSameOrigin,
  rateLimit({ windowMs: 60 * 60_000, limit: 30, standardHeaders: "draft-8" }),
  requireAuth,
  requireActive,
  requireRole("admin"),
  async (req, res) => {
    const input = invitationSchema.parse(req.body);
    const user = await provisionUser(
      input.email,
      "coordinator",
      req.authUser!.id,
    );
    await sendRoleInvitation(
      user.email,
      "Research Coordinator",
      user.accessStatus === "active",
    );
    res.status(201).json({ user: toSession(user) });
  },
);

apiRouter.get(
  "/coordinator/instructors",
  requireAuth,
  requireActive,
  requireRole("coordinator"),
  async (_req, res) => {
    const users = await listProvisionedUsers("instructor");
    res.json({ users: users.map(toSession) });
  },
);

apiRouter.post(
  "/coordinator/instructors",
  requireSameOrigin,
  rateLimit({ windowMs: 60 * 60_000, limit: 60, standardHeaders: "draft-8" }),
  requireAuth,
  requireActive,
  requireRole("coordinator"),
  async (req, res) => {
    const input = invitationSchema.parse(req.body);
    const user = await provisionUser(
      input.email,
      "instructor",
      req.authUser!.id,
    );
    await sendRoleInvitation(
      user.email,
      "Research Instructor",
      user.accessStatus === "active",
    );
    res.status(201).json({ user: toSession(user) });
  },
);
