import { randomUUID } from "node:crypto";
import pg from "pg";
import { config } from "./config.js";
import { canProvisionExistingRole } from "./policy.js";
import type { Role, UserSession } from "./types.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl
    ? { rejectUnauthorized: true, ca: config.databaseCa }
    : undefined,
});

interface UserRow {
  id: string;
  email: string;
  google_sub: string | null;
  role: Role;
  access_status: UserSession["accessStatus"];
  is_admin: boolean;
}

export interface AuthUser extends UserSession {
  id: string;
  googleSub: string | null;
}

function mapUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    googleSub: row.google_sub,
    role: row.role,
    accessStatus: row.access_status,
    isAdmin: row.is_admin,
  };
}

export function toSession(user: AuthUser): UserSession {
  return {
    email: user.email,
    role: user.role,
    accessStatus: user.accessStatus,
    isAdmin: user.isAdmin,
  };
}

export async function findUserById(id: string) {
  const result = await pool.query<UserRow>(
    `SELECT id, email, google_sub, role, access_status, is_admin
     FROM app_users WHERE id = $1`,
    [id],
  );
  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

export async function resolveGoogleUser(emailInput: string, googleSub: string) {
  const email = emailInput.trim().toLowerCase();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const subjectResult = await client.query<UserRow>(
      `SELECT id, email, google_sub, role, access_status, is_admin
       FROM app_users WHERE google_sub = $1 FOR UPDATE`,
      [googleSub],
    );
    let existing = subjectResult.rows[0];
    if (existing && existing.email !== email) {
      throw new Error(
        "Google subject email changed; audited relinking is required",
      );
    }
    if (!existing) {
      const emailResult = await client.query<UserRow>(
        `SELECT id, email, google_sub, role, access_status, is_admin
         FROM app_users WHERE email = $1 FOR UPDATE`,
        [email],
      );
      existing = emailResult.rows[0];
    }

    if (!existing) {
      const inserted = await client.query<UserRow>(
        `INSERT INTO app_users
          (id, email, google_sub, role, access_status, is_admin, confirmed_at, last_login_at)
         VALUES ($1, $2, $3, 'researcher', 'blocked', FALSE, NULL, NOW())
         RETURNING id, email, google_sub, role, access_status, is_admin`,
        [randomUUID(), email, googleSub],
      );
      await client.query("COMMIT");
      return mapUser(inserted.rows[0]);
    }

    if (existing.google_sub && existing.google_sub !== googleSub) {
      throw new Error(
        "Google subject does not match the existing account binding",
      );
    }
    const accessStatus =
      existing.access_status === "invited" ? "active" : existing.access_status;
    const updated = await client.query<UserRow>(
      `UPDATE app_users
       SET google_sub = $2, access_status = $3,
           confirmed_at = CASE WHEN $3 = 'active' THEN COALESCE(confirmed_at, NOW()) ELSE confirmed_at END,
           last_login_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING id, email, google_sub, role, access_status, is_admin`,
      [existing.id, googleSub, accessStatus],
    );
    await client.query("COMMIT");
    return mapUser(updated.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listProvisionedUsers(role: Role) {
  const result = await pool.query<UserRow>(
    `SELECT id, email, google_sub, role, access_status, is_admin
     FROM app_users WHERE role = $1 ORDER BY created_at DESC`,
    [role],
  );
  return result.rows.map(mapUser);
}

export async function provisionUser(
  emailInput: string,
  role: "coordinator" | "instructor",
  invitedBy: string,
) {
  const email = emailInput.trim().toLowerCase();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existingResult = await client.query<UserRow>(
      `SELECT id, email, google_sub, role, access_status, is_admin
       FROM app_users WHERE email = $1 FOR UPDATE`,
      [email],
    );
    const existing = existingResult.rows[0];
    let result;
    if (existing) {
      if (
        !canProvisionExistingRole(
          existing.role,
          existing.access_status,
          role,
          existing.is_admin,
        )
      ) {
        throw new Error(
          "Existing account role cannot be reassigned by this workflow",
        );
      }
      result = await client.query<UserRow>(
        `UPDATE app_users
         SET role = $2,
             access_status = CASE WHEN google_sub IS NULL THEN 'invited' ELSE 'active' END,
             confirmed_at = CASE
               WHEN google_sub IS NOT NULL THEN COALESCE(confirmed_at, NOW())
               ELSE confirmed_at
             END,
             invited_by = $3, invitation_sent_at = NOW(), updated_at = NOW()
         WHERE id = $1
         RETURNING id, email, google_sub, role, access_status, is_admin`,
        [existing.id, role, invitedBy],
      );
    } else {
      result = await client.query<UserRow>(
        `INSERT INTO app_users
          (id, email, role, access_status, is_admin, invited_by, invitation_sent_at)
         VALUES ($1, $2, $3, 'invited', FALSE, $4, NOW())
         RETURNING id, email, google_sub, role, access_status, is_admin`,
        [randomUUID(), email, role, invitedBy],
      );
    }
    await client.query("COMMIT");
    return mapUser(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
