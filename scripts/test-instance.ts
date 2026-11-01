// Creates NEW synthetic data only. No app DB client, production DB or user rows are imported.
import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import Database from "better-sqlite3";
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from "drizzle-kit/api";
import * as schema from "../lib/db/schema";
import { migrate, migrations } from "../lib/db/migrations";
import { hashPassword } from "../lib/password";
import { savePublication } from "../lib/publication-storage";
import { plainDoc, validateAnchor, type TextAnchor } from "../lib/publication-content";
const require = createRequire(import.meta.url);
const { testRoot } = require("../deploy/test/paths.cjs") as { testRoot: (root: string, initialized?: boolean) => string };
type Book = { id: string; title: string; format: string; language: string; authors: string; file: string; sha256: string; anchor: TextAnchor };
const sha = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

export async function initializeTestInstance(input: string, bundle: string) {
  const root = testRoot(input, false), data = path.join(root, "data"), uploads = path.join(root, "public/uploads");
  if (fs.existsSync(data)) throw Error("Test data already exists; initialization never resets an instance");
  if (fs.existsSync(uploads) && fs.readdirSync(uploads).some(f => f !== ".gitkeep")) throw Error("Uploads must be empty before initialization");
  const books = JSON.parse(fs.readFileSync(path.join(bundle, "books.json"), "utf8")) as Book[];
  if (books.length !== 3 || new Set(books.map(b => b.format)).size !== 3 || books.some(b => !["PDF", "EPUB", "TXT"].includes(b.format))) throw Error("Exactly one PDF, EPUB and TXT are required");
  let bytes = 0;
  for (const book of books) {
    if (!/^[\w-]+\.(pdf|epub|txt)$/.test(book.file) || !/^[\w-]+$/.test(book.id)) throw Error("Unsafe fixture reference");
    const file = path.join(bundle, book.file), stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.size > 20 * 1024 * 1024) throw Error("Only small, regular book files are supported");
    bytes += stat.size;
    if (sha(fs.readFileSync(file)) !== book.sha256) throw Error("Fixture checksum mismatch");
    book.anchor = validateAnchor(book.anchor);
    if (book.anchor.documentId !== book.id || book.anchor.textVersion !== `sha256:${book.sha256}`) throw Error("Anchor does not belong to the supplied book version");
  }
  const empty = await generateSQLiteDrizzleJson({}), base = await generateSQLiteDrizzleJson(schema);
  // Reconstruct only an IN-MEMORY empty pre-migration schema. Then execute the actual,
  // unchanged migrations, so ledger entries reflect executed SQL, not invented history.
  for (const migration of migrations) {
    for (const match of migration.sql.matchAll(/ALTER TABLE (\w+) ADD COLUMN (\w+)/g)) {
      const table = base.tables[match[1]], column = match[2];
      if (!table?.columns[column]) throw Error(`Schema/migration mismatch: ${match[1]}.${column}`);
      delete table.columns[column];
      for (const [key, fk] of Object.entries(table.foreignKeys) as [string, { columnsFrom: string[] }][]) if (fk.columnsFrom.includes(column)) delete table.foreignKeys[key];
      for (const [key, index] of Object.entries(table.indexes) as [string, { columns: string[] }][]) if (index.columns.includes(column)) delete table.indexes[key];
    }
    for (const match of migration.sql.matchAll(/CREATE TABLE (\w+)/g)) delete base.tables[match[1]];
  }
  const sql = await generateSQLiteMigration(empty, base);
  const db = new Database(":memory:");
  const instanceId = randomUUID(), prefix = `test-${instanceId.slice(0, 8)}`;
  const credentials: { role: string; id: string; email: string; password: string; gateUser: string; gatePassword: string }[] = [];
  try {
    db.exec(sql.join("\n")); migrate(db); db.pragma("foreign_keys=ON");
    for (const [index, role] of ["admin", "booster", "member"].entries()) {
      const user = { role, id: `${prefix}-${role}`, email: `${role}@test.invalid`, password: randomBytes(18).toString("base64url"), gateUser: `tester${index + 1}`, gatePassword: randomBytes(24).toString("base64url") };
      db.prepare("INSERT INTO users(id,email,name,password_hash,role) VALUES(?,?,?,?,?)").run(user.id, user.email, `Тест · ${role}`, await hashPassword(user.password), role); credentials.push(user);
    }
    const [admin, editor, reader] = credentials;
    db.prepare("INSERT INTO categories(id,slug,name) VALUES(?,?,?)").run(prefix, "test-library", "Тестовая библиотека · 3 книги");
    for (const [i, book] of books.entries()) {
      db.prepare("INSERT INTO documents(id,title,category_id,file_url,file_name,file_type,language,content_hash) VALUES(?,?,?,?,?,?,?,?)").run(book.id, book.title, prefix, `/uploads/${book.file}`, book.file, book.format, book.language, book.sha256);
      const authorId = `${prefix}-author-${i}`;
      db.prepare("INSERT INTO authors(id,name,slug) VALUES(?,?,?)").run(authorId, book.authors || "Автор издания", authorId);
      db.prepare("INSERT INTO document_authors(document_id,author_id) VALUES(?,?)").run(book.id, authorId);
      for (const [visibility, owner] of [["public", editor], ["private", editor]] as const) {
        const id = `${prefix}-note-${i}-${visibility}`;
        db.prepare("INSERT INTO annotations(id,document_id,author_id,page,x,y,body,visibility,allow_discussion,anchor_text,text_anchor) VALUES(?,?,?,?,200,200,?,?,?,?,?)").run(id, book.id, owner.id, book.anchor.page, `${visibility === "private" ? "Личная" : "Общая"} тестовая пометка: что меняется при повторном чтении?`, visibility, Number(visibility === "public"), book.anchor.exact, JSON.stringify(book.anchor));
        if (visibility === "public") db.prepare("INSERT INTO comments(id,document_id,annotation_id,author_id,page,body) VALUES(?,?,?,?,?,?)").run(`${id}-comment`, book.id, id, reader.id, book.anchor.page, "Тестовый комментарий к этому фрагменту.");
      }
      db.prepare("INSERT INTO comments(id,document_id,author_id,body) VALUES(?,?,?,?)").run(`${prefix}-book-comment-${i}`, book.id, reader.id, "Комментарий к книге целиком.");
      const topic = `${prefix}-topic-${i}`;
      db.prepare("INSERT INTO forum_topics(id,title,body,author_id,document_id,anchor_json) VALUES(?,?,?,?,?,?)").run(topic, `Читаем вместе: ${book.title}`, "Тестовое обсуждение: выделите важную мысль и ответьте собеседнику.", editor.id, book.id, JSON.stringify(book.anchor));
      db.prepare("INSERT INTO forum_posts(id,topic_id,author_id,body) VALUES(?,?,?,?)").run(`${topic}-reply`, topic, reader.id, "Давайте сравним впечатления от этого фрагмента.");
    }
    for (const [id, slug, title, owner, kind] of [[`${prefix}-channel`, "reading-lab", "На полях · тестовый канал", editor.id, "author"], [`${prefix}-club`, "reading-club", "Читательский клуб · тест", admin.id, "author"], [`${prefix}-news`, "library", "Хроника · тестовые новости", admin.id, "news"]]) {
      db.prepare("INSERT INTO channels(id,slug,title,description,owner_id,kind) VALUES(?,?,?,?,?,?)").run(id, slug, title, "Изолированная среда. Все записи здесь тестовые.", owner, kind);
      for (const [i, book] of books.entries()) savePublication(db, id, owner, { title: kind === "news" ? `Пробуем новую читалку · ${book.format}` : `Мысль на полях · ${book.format}`, content: { version: 1, blocks: [
        { id: "intro", type: "text", doc: plainDoc(`Это тестовая запись. Откройте книгу, добавьте комментарий и поделитесь своим фрагментом. /documents/${book.id}`) },
        { id: "book", type: "book", documentId: book.id }, { id: "quote", type: "quote", anchor: book.anchor, comment: "Сравним, как этот фрагмент звучит вне контекста." },
      ] }, published: true, pinned: i === 0 });
    }
    const firstPost = db.prepare("SELECT id FROM channel_posts ORDER BY created_at LIMIT 1").get() as { id: string };
    db.prepare("INSERT INTO channel_comments(id,post_id,author_id,body) VALUES(?,?,?,?)").run(`${prefix}-channel-comment`, firstPost.id, reader.id, "Проверяем разговор под публикацией.");
    db.prepare("INSERT INTO site_settings(key,value) VALUES('config',?)").run(JSON.stringify({ paymentsEnabled: false, yookassaMode: "test", receiptsEnabled: false, musicEnabled: false }));
    db.prepare("INSERT INTO site_settings(key,value) VALUES('feature_flags',?)").run(JSON.stringify({ modes: { channels: "on", channel_creation: "on", feed: "on", forum: "on", comments: "on", rooms: "on", room_creation: "on", host_programs: "on", paid_events: "off", experimental: "off" }, testerIds: [] }));
    if (db.pragma("integrity_check", { simple: true }) !== "ok" || (db.pragma("foreign_key_check") as unknown[]).length) throw Error("Fixture integrity check failed");
    fs.mkdirSync(data, { mode: 0o700 }); fs.mkdirSync(uploads, { recursive: true });
    for (const book of books) fs.copyFileSync(path.join(bundle, book.file), path.join(uploads, book.file), fs.constants.COPYFILE_EXCL);
    for (const name of ["community-uploads", "music-uploads", "tmp-uploads", "logs"]) fs.mkdirSync(path.join(data, name), { mode: 0o700 });
    const dbPath = path.join(data, "app.db"); await db.backup(dbPath); fs.chmodSync(dbPath, 0o600);
    const marker = { kind: "blabla-isolated-test", instanceId, books: books.map(b => ({ id: b.id, file: b.file, sha256: b.sha256 })), source: "synthetic schema + three explicit book files; no production database", counts: { users: 3, documents: 3, authorChannels: 2, newsChannels: 1, posts: 9, annotations: 6, comments: 6, topics: 3 }, bookBytes: bytes };
    fs.writeFileSync(path.join(data, "test-instance.json"), JSON.stringify(marker, null, 2), { mode: 0o600 });
    fs.writeFileSync(path.join(data, "test-credentials.json"), JSON.stringify(credentials, null, 2), { mode: 0o600 });
    fs.writeFileSync(path.join(data, "gate-auth.json"), JSON.stringify(credentials.map(c => ({ user: c.gateUser, digest: sha(`${c.gateUser}:${c.gatePassword}`) }))), { mode: 0o600 });
    // Recovery check uses the Backup API too; never copy a live SQLite file.
    const saved = new Database(dbPath, { readonly: true, fileMustExist: true });
    try { await saved.backup(path.join(data, "initial-backup.db")); } finally { saved.close(); }
    const backup = new Database(path.join(data, "initial-backup.db"), { readonly: true });
    try { if (backup.pragma("integrity_check", { simple: true }) !== "ok" || (backup.pragma("foreign_key_check") as unknown[]).length) throw Error("Backup verification failed"); } finally { backup.close(); }
    fs.chmodSync(path.join(data, "initial-backup.db"), 0o600);
    return marker;
  } finally { db.close(); }
}
if (process.argv[1]?.endsWith("/test-instance.ts")) {
  if (process.argv.length !== 4) throw Error("Usage: node --import tsx scripts/test-instance.ts /isolated/app /book-bundle");
  initializeTestInstance(process.argv[2], process.argv[3]).then(result => console.log(JSON.stringify({ instanceId: result.instanceId, counts: result.counts, bookBytes: result.bookBytes, credentials: "data/test-credentials.json (private; do not paste in chat)" }))).catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
