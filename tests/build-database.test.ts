import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";

test("compilation gets an empty complete schema and cannot overwrite an existing database", t => {
  // Match the builder's explicit disposable location; no app DB client import.
  const parent = fs.realpathSync(os.tmpdir());
  const base = parent.startsWith("/private/") ? "/private/tmp" : parent;
  const root = fs.mkdtempSync(path.join(base, "blabla-release-commit-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "build-data"));
  const file = path.join(root, "build-data/app.db");
  const run = (target: string) => spawnSync(process.execPath, ["--import", "tsx", "scripts/build-database.ts", "--empty-build-only", target], { encoding: "utf8" });
  const first = run(file);
  assert.equal(first.status, 0, first.stderr);
  const db = new Database(file);
  try {
    assert.equal((db.prepare("SELECT count(*) n FROM users").get() as { n: number }).n, 0);
    assert.equal((db.prepare("SELECT count(*) n FROM documents").get() as { n: number }).n, 0);
    assert(db.prepare("SELECT name FROM pragma_table_info('annotations') WHERE name='text_anchor'").get());
    db.prepare("INSERT INTO site_settings(key,value) VALUES('preserve','content')").run();
  } finally { db.close(); }
  const before = fs.readFileSync(file);
  assert.notEqual(run(file).status, 0);
  assert.deepEqual(fs.readFileSync(file), before);
  const refused = run(path.join(root, "wrong.db"));
  assert.notEqual(refused.status, 0);
  assert(!fs.existsSync(path.join(root, "wrong.db")));
});
