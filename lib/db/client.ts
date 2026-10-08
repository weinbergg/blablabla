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

/** Монетизация: тарифы, подписки, платежи, журнал выдачи файлов, токены
 * читалок. Создаётся здесь по тому же принципу, что и форум с works —
 * чтобы деплой не зависел от `drizzle-kit push`. */
function ensureBillingTables() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      updated_at TEXT NOT NULL DEFAULT (current_timestamp)
    );
    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY NOT NULL,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      tagline TEXT,
      description TEXT,
      price_monthly INTEGER NOT NULL DEFAULT 0,
      price_yearly INTEGER,
      price_lifetime INTEGER,
      features TEXT NOT NULL DEFAULT '[]',
      seat_limit INTEGER,
      lifetime INTEGER NOT NULL DEFAULT 0,
      accent TEXT,
      badge TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (current_timestamp)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS plans_slug_idx ON plans(slug);
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan_slug TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      period TEXT NOT NULL DEFAULT 'month',
      started_at TEXT,
      expires_at TEXT,
      canceled_at TEXT,
      source TEXT NOT NULL DEFAULT 'yookassa',
      auto_renew INTEGER NOT NULL DEFAULT 0,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (current_timestamp)
    );
    CREATE INDEX IF NOT EXISTS subscriptions_user_idx ON subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON subscriptions(status);
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      kind TEXT NOT NULL DEFAULT 'subscription',
      target_id TEXT,
      plan_slug TEXT,
      period TEXT,
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'RUB',
      status TEXT NOT NULL DEFAULT 'pending',
      provider TEXT NOT NULL DEFAULT 'yookassa',
      provider_payment_id TEXT,
      idempotence_key TEXT,
      description TEXT,
      payload TEXT,
      paid_at TEXT,
      created_at TEXT NOT NULL DEFAULT (current_timestamp)
    );
    CREATE INDEX IF NOT EXISTS payments_user_idx ON payments(user_id);
    CREATE INDEX IF NOT EXISTS payments_provider_idx ON payments(provider_payment_id);
    CREATE TABLE IF NOT EXISTS download_events (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
      kind TEXT NOT NULL DEFAULT 'read',
      ip TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL DEFAULT (current_timestamp)
    );
    CREATE INDEX IF NOT EXISTS download_events_user_idx ON download_events(user_id);
    CREATE INDEX IF NOT EXISTS download_events_created_idx ON download_events(created_at);
    CREATE TABLE IF NOT EXISTS api_tokens (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      prefix TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'opds',
      last_used_at TEXT,
      revoked_at TEXT,
      created_at TEXT NOT NULL DEFAULT (current_timestamp)
    );
    CREATE INDEX IF NOT EXISTS api_tokens_user_idx ON api_tokens(user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS api_tokens_hash_idx ON api_tokens(token_hash);
  `);
}

function ensureChannelTables() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY NOT NULL,
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL DEFAULT 'author',
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (current_timestamp)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS channels_slug_idx ON channels(slug);
    CREATE INDEX IF NOT EXISTS channels_owner_idx ON channels(owner_id);
    CREATE TABLE IF NOT EXISTS channel_posts (
      id TEXT PRIMARY KEY NOT NULL,
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
      published INTEGER NOT NULL DEFAULT 1,
      pinned INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT,
      created_at TEXT NOT NULL DEFAULT (current_timestamp)
    );
    CREATE INDEX IF NOT EXISTS channel_posts_channel_idx ON channel_posts(channel_id);
    CREATE UNIQUE INDEX IF NOT EXISTS channel_posts_slug_idx ON channel_posts(channel_id, slug);
    CREATE INDEX IF NOT EXISTS channel_posts_created_idx ON channel_posts(created_at);
  `);
}

try {
  ensureForumTables();
  ensureWorkTables();
  ensureBillingTables();
  ensureChannelTables();
} catch {
  /* users/documents may not exist yet on a blank install */
}

if (process.env.NODE_ENV !== "production") {
  global.__sqlite = sqlite;
}

export const db = drizzle(sqlite, { schema });
export { sqlite };
