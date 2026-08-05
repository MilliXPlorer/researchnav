import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { pool } from "./db.js";

const migrationUrl = new URL("./migrations/001_auth.sql", import.meta.url);
const sql = await readFile(fileURLToPath(migrationUrl), "utf8");

try {
  await pool.query(sql);
  console.info("Database migration completed");
} finally {
  await pool.end();
}
