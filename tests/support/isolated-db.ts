import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { runInThisContext } from "node:vm";
import ts from "typescript";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import * as schema from "../../lib/db/schema";

const requireFromTest = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Evaluate the actual routes/queries with an in-memory DB and a controlled session.
// The production DB client is never imported, even indirectly.
export function loadModule<T>(relative: string, mocks: Record<string, unknown>): T {
  const filename = path.join(root, relative);
  const source = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const loaded = { exports: {} };
  const load = (id: string) => {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    if (id.includes("client") || id.includes("/db/") || id === "server-only") {
      throw new Error(`Unmocked server dependency: ${id}`);
    }
    return requireFromTest(id.startsWith("@/") ? path.join(root, id.slice(2)) : id);
  };
  runInThisContext(`(function(require,module,exports){${source}\n})`, { filename })(load, loaded, loaded.exports);
  return loaded.exports as T;
}

export function fixture() {
  const sqlite = new Database(":memory:");
  for (const table of [schema.users, schema.authors, schema.documentAuthors, schema.documents, schema.annotations, schema.comments, schema.reports, schema.feedback,
    schema.channels, schema.channelPosts, schema.channelComments, schema.channelModerators,
    schema.forumTopics, schema.forumPosts, schema.forumWatches, schema.forumReactions, schema.seminars, schema.seminarMembers, schema.seminarTickets, schema.seminarMeetings, schema.siteSettings, schema.communityAttachments, schema.communityMarks]) {
    const config = getTableConfig(table);
    const columns = config.columns.map((column) => `"${column.name}" ${column.getSQLType()}${column.primary ? " PRIMARY KEY" : ""}${typeof column.default === "string" ? " DEFAULT '" + column.default.replaceAll("'", "''") + "'" : typeof column.default === "number" ? " DEFAULT " + column.default : ""}`);
    for (const key of config.primaryKeys) columns.push(`PRIMARY KEY (${key.columns.map((column) => `"${column.name}"`).join(",")})`);
    sqlite.exec(`CREATE TABLE "${config.name}" (${columns.join(",")})`);
  }
  sqlite.exec(`
    CREATE UNIQUE INDEX forum_watches_pk ON forum_watches(user_id,topic_id);
    CREATE UNIQUE INDEX channel_moderators_pk ON channel_moderators(channel_id,user_id);
    CREATE UNIQUE INDEX channel_posts_client_key_idx ON channel_posts(channel_id,author_id,client_key);
    INSERT INTO users (id,name,role) VALUES ('owner','Owner','member'),('other','Other','member');
    INSERT INTO documents (id,title) VALUES ('book','Book'),('other-book','Other Book');
    INSERT INTO annotations (id,document_id,author_id,page,visibility,allow_discussion)
      VALUES ('public','book','owner',3,'public',1),('private','book','owner',4,'private',0);
    INSERT INTO channels (id,owner_id,kind,title,archived) VALUES ('channel','owner','author','Channel',0);
    INSERT INTO channel_posts (id,channel_id,author_id,published,comments_open) VALUES
      ('published','channel','owner',1,1),('draft','channel','owner',0,1),('closed','channel','owner',1,0);
  `);
  const db = drizzle(sqlite, { schema });
  let user: { id: string; name: string; role: string } | null = { id: "owner", name: "Owner", role: "member" };
  const mocks: Record<string, unknown> = {
    "@/lib/forum-access": { forumAccess: async () => ({ read: false, write: false, moderate: false }) },
    "@/lib/features": { featureEnabled: async () => true, featureDenied: async () => null },
    "@/lib/auth": { getCurrentUser: async () => user },
    "@/lib/db/client": { db, sqlite }, "./client": { db, sqlite },
    "@/lib/db/schema": schema, "./schema": schema,
    "@/lib/db/works": {}, "server-only": {},
    "next/cache": { revalidatePath: () => {} },
    "next/server": { NextResponse: { json: (value: unknown, options?: ResponseInit) => Response.json(value, options) } },
  };
  return { sqlite, db, mocks, setUser: (value: typeof user) => { user = value; } };
}
