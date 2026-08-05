import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import { pool } from "./db.js";

if (!config.bootstrapAdminEmail) {
  throw new Error(
    "BOOTSTRAP_ADMIN_EMAIL must be set before running admin:bootstrap",
  );
}

try {
  await pool.query(
    `INSERT INTO app_users (id, email, role, access_status, is_admin, confirmed_at)
     VALUES ($1, $2, 'admin', 'active', TRUE, NOW())
     ON CONFLICT (email) DO UPDATE SET
       role = 'admin', access_status = 'active', is_admin = TRUE,
       confirmed_at = COALESCE(app_users.confirmed_at, NOW()), updated_at = NOW()`,
    [randomUUID(), config.bootstrapAdminEmail],
  );
  console.info("Administrator account provisioned");
} finally {
  await pool.end();
}
