import path from "path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "app.db");

declare global {
  var __sqlite: Database.Database | undefined;
}

const sqlite = global.__sqlite || new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

/** Additive SQLite columns that `drizzle-kit push` may not have run yet on a
 *  live DB. Safe no-ops once the column exists; ignored if the table itself
 *  hasn't been created (fresh install before the first push). */
function ensureColumn(table: string, column: string, definition: string) {
  try {
    const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (cols.length === 0 || cols.some((col) => col.name === column)) return;
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  } catch {
    // table missing — drizzle push will create it with the column already in
  }
}

ensureColumn("feedback", "admin_reply", "admin_reply TEXT");
ensureColumn("feedback", "replied_at", "replied_at TEXT");
ensureColumn("feedback", "replied_by", "replied_by TEXT");

if (process.env.NODE_ENV !== "production") {
  global.__sqlite = sqlite;
}

export const db = drizzle(sqlite, { schema });
export { sqlite };
