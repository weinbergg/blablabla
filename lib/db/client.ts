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

if (process.env.NODE_ENV !== "production") {
  global.__sqlite = sqlite;
}

export const db = drizzle(sqlite, { schema });
export { sqlite };
