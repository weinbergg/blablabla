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
ensureColumn("users", "avatar_key", "avatar_key TEXT");
ensureColumn("users", "avatar_color", "avatar_color TEXT");
ensureColumn("forum_posts", "updated_at", "updated_at TEXT");
ensureColumn("annotations", "companion_document_id", "companion_document_id TEXT");
ensureColumn("annotations", "companion_page", "companion_page INTEGER");
ensureColumn("annotations", "companion_title", "companion_title TEXT");

function ensureWorkTables() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS works (
      id TEXT PRIMARY KEY NOT NULL,
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      author_id TEXT REFERENCES authors(id) ON DELETE SET NULL,
      source TEXT NOT NULL DEFAULT 'auto',
      created_at TEXT NOT NULL DEFAULT (current_timestamp)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS works_slug_idx ON works(slug);
    CREATE INDEX IF NOT EXISTS works_author_idx ON works(author_id);
    CREATE TABLE IF NOT EXISTS work_documents (
      work_id TEXT NOT NULL REFERENCES works(id) ON DELETE CASCADE,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'edition'
    );
    CREATE UNIQUE INDEX IF NOT EXISTS work_documents_document_idx ON work_documents(document_id);
    CREATE INDEX IF NOT EXISTS work_documents_work_idx ON work_documents(work_id);
  `);
}

function ensureForumTables() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS forum_topics (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
      locked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (current_timestamp)
    );
    CREATE INDEX IF NOT EXISTS forum_topics_created_idx ON forum_topics(created_at);
    CREATE INDEX IF NOT EXISTS forum_topics_document_idx ON forum_topics(document_id);
    CREATE TABLE IF NOT EXISTS forum_posts (
      id TEXT PRIMARY KEY NOT NULL,
      topic_id TEXT NOT NULL REFERENCES forum_topics(id) ON DELETE CASCADE,
      parent_id TEXT,
      author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (current_timestamp)
    );
    CREATE INDEX IF NOT EXISTS forum_posts_topic_idx ON forum_posts(topic_id);
  `);
}

try {
  ensureForumTables();
  ensureWorkTables();
} catch {
  /* users/documents may not exist yet on a blank install */
}

if (process.env.NODE_ENV !== "production") {
  global.__sqlite = sqlite;
}

export const db = drizzle(sqlite, { schema });
export { sqlite };
