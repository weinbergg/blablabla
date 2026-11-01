import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { isTable } from "drizzle-orm";
import * as current from "../lib/db/schema";
import { migrate, migrations } from "../lib/db/migrations";
import { legacyBaseline } from "../lib/db/legacy-baseline";
import { applyReviewedMigration } from "../lib/db/release-transaction";
import captured from "./fixtures/production-schema-20261029.json";
import releasePlan from "../deploy/release-plan.json";

test("committed release plan matches the exact migration SQL used by the release runner", () => {
  assert.deepEqual(releasePlan.migrationPlan, [legacyBaseline, ...migrations.map(m => ({
    id: m.id, checksum: createHash("sha256").update(m.sql).digest("hex"),
  }))]);
});

function populate(db: Database.Database) {
  db.pragma("foreign_keys=OFF");
  for (const o of captured.schema.filter(o => o.type === "table")) db.exec(o.sql);
  for (const o of captured.schema.filter(o => o.type !== "table")) db.exec(o.sql);
  db.exec(`
    INSERT INTO users(id,email,name,password_hash) VALUES('reader','synthetic@example.test','Reader','fixture-only');
    INSERT INTO categories(id,slug,name) VALUES('category','books','Books');
    INSERT INTO documents(id,title,category_id,file_type,file_url) VALUES('book','Book','category','TXT','/uploads/book.txt');
    INSERT INTO authors(id,name,slug) VALUES('author','Author','author');
    INSERT INTO document_authors(document_id,author_id) VALUES('book','author');
    INSERT INTO annotations(id,document_id,author_id,page,x,y,body,visibility) VALUES('note','book','reader',1,3,5,'Private annotation','private');
    INSERT INTO comments(id,document_id,author_id,body) VALUES('comment','book','reader','Comment');
    INSERT INTO channels(id,slug,title,owner_id) VALUES('channel','channel','Channel','reader');
    INSERT INTO channel_posts(id,channel_id,author_id,slug,title,body) VALUES('post','channel','reader','post','Post','Legacy body');
    INSERT INTO forum_topics(id,title,body,author_id) VALUES('topic','Topic','Body','reader');
    INSERT INTO forum_posts(id,topic_id,author_id,body) VALUES('reply','topic','reader','Reply');
    INSERT INTO plans(id,slug,name,price_monthly) VALUES('plan','plan','Ticket',39900);
    INSERT INTO payments(id,user_id,amount,status) VALUES('payment','reader',39900,'succeeded');
    INSERT INTO site_settings(key,value) VALUES('feature_flags','{"modes":{"channels":"off"}}');
  `);
  for (let i = 0; i < 6; i++) db.prepare("INSERT INTO document_authors(document_id,author_id) VALUES(?,?)").run(`missing-${i}`, "author");
}
const objects = (db: Database.Database) => db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type,name").all();

test("captured production schema migrates on a restored WAL copy, preserving old content, files and six existing FK violations", t => {
  const root = mkdtempSync(path.join(tmpdir(), "blabla-legacy-release-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source.db"), db = new Database(source);
  t.after(() => db.close());
  db.pragma("journal_mode=WAL"); db.pragma("wal_autocheckpoint=0"); populate(db);
  const before = objects(db);
  mkdirSync(path.join(root, "public/uploads"), { recursive: true });
  writeFileSync(path.join(root, "public/uploads/book.txt"), "Library text");
  const run = spawnSync(process.execPath, ["--import", "tsx", "scripts/verify-release.ts", source, root, root, "--bootstrap", "--legacy-baseline"], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr + run.stdout);
  const report = JSON.parse(readFileSync(JSON.parse(run.stdout).report, "utf8"));
  assert.equal(report.ready, true); assert.equal(report.productionVerified, false);
  assert.equal(report.contentPreserved, true); assert.equal(report.bootstrap.unchanged, true);
  assert.equal(report.existingForeignKeyIssueHashes.length, 6);
  assert.deepEqual(report.applied, [legacyBaseline.id, ...migrations.map(m => m.id)]);
  assert.deepEqual(objects(db), before, "live source schema must be unchanged");
  const restored = new Database(report.restoredPath, { readonly: true });
  try {
    for (const table of Object.values(current).filter(isTable)) {
      const config = getTableConfig(table);
      const actual = (restored.prepare(`PRAGMA table_info("${config.name}")`).all() as { name: string }[]).map(c => c.name);
      for (const col of config.columns) assert(actual.includes(col.name), `${config.name}.${col.name} missing`);
    }
    assert.equal((restored.prepare("SELECT body FROM channel_posts").get() as { body: string }).body, "Legacy body");
    assert.deepEqual(restored.prepare("SELECT amount,status FROM payments").get(), { amount: 39900, status: "succeeded" });
  } finally { restored.close(); }
});

test("legacy migration refuses schema drift before any writes", t => {
  const db = new Database(":memory:"); t.after(() => db.close()); populate(db);
  db.exec("ALTER TABLE users ADD COLUMN unexpected TEXT");
  const before = objects(db);
  assert.throws(() => migrate(db, { legacyBaseline: true }), /exact reviewed/);
  assert.deepEqual(objects(db), before);
});

test("failure in a later migration rolls back the whole legacy transition", t => {
  const db = new Database(":memory:"); t.after(() => db.close()); populate(db);
  const before = objects(db), keys = db.pragma("foreign_key_check");
  const original = migrations[2].sql;
  try {
    migrations[2].sql += "\nSELECT * FROM deliberately_missing_table;";
    assert.throws(() => migrate(db, { legacyBaseline: true }), /deliberately_missing_table/);
  } finally { migrations[2].sql = original; }
  assert.deepEqual(objects(db), before); assert.deepEqual(db.pragma("foreign_key_check"), keys);
  assert.equal((db.prepare("SELECT body FROM channel_posts").get() as { body: string }).body, "Legacy body");
});

test("legacy ledger is idempotent and rejects a changed checksum", t => {
  const db = new Database(":memory:"); t.after(() => db.close()); populate(db);
  assert.equal(migrate(db, { legacyBaseline: true }).length, 4);
  const before = objects(db);
  assert.deepEqual(migrate(db, { legacyBaseline: true }), []);
  assert.deepEqual(objects(db), before);
  db.prepare("UPDATE schema_migrations SET checksum='invalid' WHERE id=?").run(legacyBaseline.id);
  assert.throws(() => migrate(db, { legacyBaseline: true }), /checksum mismatch/);
  assert.deepEqual(objects(db), before);
});

test("final release transaction preserves the checked backup and refuses intervening writes", t => {
  const db = new Database(":memory:");
  t.after(() => db.close()); populate(db);
  const frozen = new Database(db.serialize()); t.after(() => frozen.close());
  const before = objects(db);
  db.exec("UPDATE comments SET body='Written after backup'");
  assert.throws(() => applyReviewedMigration(db, frozen), /Database changed after backup/);
  assert.deepEqual(objects(db), before);
  assert.equal((db.prepare("SELECT body FROM comments").get() as { body: string }).body, "Written after backup");
  const currentBackup = new Database(db.serialize()); t.after(() => currentBackup.close());
  const result = applyReviewedMigration(db, currentBackup);
  assert.equal(result.contentPreserved, true); assert.equal(result.existingForeignKeyIssues, 6);
  assert.equal(result.applied.length, 4);
  assert.deepEqual(objects(currentBackup), before);
  assert.equal((db.prepare("SELECT body FROM comments").get() as { body: string }).body, "Written after backup");
});
