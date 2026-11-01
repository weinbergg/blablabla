import type Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { applyLegacyBaseline } from "./legacy-baseline";

// Explicit CLI migrations only. Importing a page must never run these changes.
export const migrations = [{
  id: "20261020_01_channel_publications",
  sql: `
    ALTER TABLE channels ADD COLUMN avatar_attachment_id TEXT;
    ALTER TABLE channels ADD COLUMN cover_attachment_id TEXT;
    ALTER TABLE channel_moderators ADD COLUMN role TEXT NOT NULL DEFAULT 'editor';
    ALTER TABLE channel_moderators ADD COLUMN legacy_moderation INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE channel_posts ADD COLUMN content_json TEXT;
    ALTER TABLE channel_posts ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE channel_posts ADD COLUMN client_key TEXT;
    ALTER TABLE channel_posts ADD COLUMN deleted_at TEXT;
    CREATE UNIQUE INDEX channel_posts_client_key_idx ON channel_posts(channel_id, author_id, client_key);
    ALTER TABLE channel_comments ADD COLUMN parent_id TEXT REFERENCES channel_comments(id) ON DELETE SET NULL;
    CREATE TABLE channel_post_reactions (
      post_id TEXT NOT NULL REFERENCES channel_posts(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      emoji TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(post_id, user_id, emoji)
    );
    CREATE TABLE channel_post_saves (
      post_id TEXT NOT NULL REFERENCES channel_posts(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(post_id, user_id)
    );
  `,
}, {
  id: "20261020_02_reading_rooms",
  sql: `
    ALTER TABLE seminars ADD COLUMN access_mode TEXT NOT NULL DEFAULT 'legacy';
    ALTER TABLE seminars ADD COLUMN room_enabled INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE seminars ADD COLUMN reading_state TEXT;
    ALTER TABLE seminars ADD COLUMN invite_hash TEXT;
    ALTER TABLE seminars ADD COLUMN discussion_locked INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE forum_posts ADD COLUMN anchor_json TEXT;
    ALTER TABLE forum_posts ADD COLUMN message_kind TEXT NOT NULL DEFAULT 'message';
    ALTER TABLE forum_posts ADD COLUMN deleted_at TEXT;
    ALTER TABLE annotations ADD COLUMN text_anchor TEXT;
    CREATE TABLE seminar_members (
      seminar_id TEXT NOT NULL REFERENCES seminars(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member',
      status TEXT NOT NULL DEFAULT 'invited',
      invited_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      joined_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(seminar_id,user_id)
    );
    CREATE TABLE seminar_meetings (
      id TEXT PRIMARY KEY,
      seminar_id TEXT NOT NULL REFERENCES seminars(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      ends_at TEXT,
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'scheduled',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX seminar_meetings_room_idx ON seminar_meetings(seminar_id,starts_at);
  `,
}, {
  id: "20261021_03_forum_reading_context",
  sql: `
    ALTER TABLE forum_topics ADD COLUMN anchor_json TEXT;
    ALTER TABLE forum_posts ADD COLUMN document_id TEXT REFERENCES documents(id) ON DELETE SET NULL;
    ALTER TABLE forum_watches ADD COLUMN last_read_seq INTEGER NOT NULL DEFAULT 0;
  `,
}];

export function migrate(db: Database.Database, options: { legacyBaseline?: boolean } = {}): string[] {
  db.pragma("foreign_keys = ON");
  if (options.legacyBaseline) {
    return db.transaction((): string[] => [...applyLegacyBaseline(db), ...migrate(db)]).immediate();
  }
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
  const applied: string[] = [];
  for (const migration of migrations) {
    const checksum = createHash("sha256").update(migration.sql).digest("hex");
    db.transaction(() => {
      const prior = db.prepare("SELECT checksum FROM schema_migrations WHERE id = ?").get(migration.id) as { checksum: string } | undefined;
      if (prior) {
        if (prior.checksum !== checksum) throw new Error(`Migration checksum mismatch: ${migration.id}`);
        return;
      }
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_migrations(id,checksum) VALUES(?,?)").run(migration.id, checksum);
      applied.push(migration.id);
    }).immediate();
  }
  return applied;
}
