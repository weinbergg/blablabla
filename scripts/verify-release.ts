// Offline rehearsal only. Never import lib/db/client: it contains runtime DDL.
import Database from "better-sqlite3";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { migrate, migrations } from "../lib/db/migrations";
import { legacyBaseline } from "../lib/db/legacy-baseline";
import { inventory, foreignKeys } from "../lib/db/verification";

async function main() {
const [sourceArg, outputArg, filesArg, ...flags] = process.argv.slice(2);
if (flags.some(flag => !["--bootstrap", "--legacy-baseline"].includes(flag)) || new Set(flags).size !== flags.length) throw Error("Supported options: --bootstrap --legacy-baseline");
const bootstrapArg = flags.includes("--bootstrap"), useLegacyBaseline = flags.includes("--legacy-baseline");
if (!sourceArg || !outputArg || !filesArg) throw Error("Usage: node --import tsx scripts/verify-release.ts /offline/source.db /reports /copied/app-root");
const sourcePath = path.resolve(sourceArg), filesRoot = await fs.realpath(filesArg);
const folder = await fs.mkdtemp(path.join(path.resolve(outputArg), "release-check-"));
await fs.chmod(folder, 0o700);
const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
const backupPath = path.join(folder, "backup.db"), restoredPath = path.join(folder, "restored.db");
const report: Record<string, unknown> = { sourcePath, backupPath, restoredPath, checkedAt: new Date().toISOString(), productionVerified: false, ready: false };
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
async function fileInventory(db: Database.Database) {
  const tables = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(row => row.name));
  const refs: { owner: string; root: string; relative: string }[] = [];
  if (tables.has("documents")) for (const row of db.prepare("SELECT id,file_url FROM documents WHERE file_url IS NOT NULL").all() as { id: string; file_url: string }[]) {
    if (row.file_url.startsWith("/uploads/")) refs.push({ owner: `document:${row.id}`, root: "public/uploads", relative: row.file_url.slice(9) });
    else refs.push({ owner: `document:${row.id}`, root: "", relative: "UNSUPPORTED:" + row.file_url });
  }
  for (const [table, column, root] of [["community_attachments", "disk_name", "data/community-uploads"], ["music_tracks", "stored_name", "data/music-uploads"]]) {
    if (!tables.has(table)) continue;
    if (!(db.prepare(`PRAGMA table_info(${quote(table)})`).all() as { name: string }[]).some(c => c.name === column)) throw Error(`Review storage schema for ${table}`);
    for (const row of db.prepare(`SELECT id,${quote(column)} AS file FROM ${quote(table)}`).all() as { id: string; file: string }[]) refs.push({ owner: `${table}:${row.id}`, root, relative: row.file });
  }
  const results = [];
  for (const ref of refs) {
    const root = path.resolve(filesRoot, ref.root), file = path.resolve(root, ref.relative || "");
    if (!ref.root || !file.startsWith(root + path.sep)) { results.push({ owner: ref.owner, status: "unsafe-or-external" }); continue; }
    const real = await fs.realpath(file).catch(() => null);
    // A supplied offline copy must be self-contained, including storage directories.
    if (!real || !real.startsWith(filesRoot + path.sep)) { results.push({ owner: ref.owner, status: "missing-or-external-symlink" }); continue; }
    const stat = await fs.stat(real); if (!stat.isFile()) { results.push({ owner: ref.owner, status: "not-file" }); continue; }
    const hash = createHash("sha256"); for await (const chunk of createReadStream(real)) hash.update(chunk);
    results.push({ owner: ref.owner, path: path.relative(filesRoot, file), size: stat.size, sha256: hash.digest("hex"), status: "ok" });
  }
  return results;
}
try {
  await source.backup(backupPath); await fs.chmod(backupPath, 0o600);
  const backup = new Database(backupPath, { readonly: true, fileMustExist: true });
  try {
    assert.equal(backup.pragma("integrity_check", { simple: true }), "ok");
    report.schema = backup.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type,name").all();
    const migrationPlan = [...(useLegacyBaseline ? [legacyBaseline] : []), ...migrations.map(m => ({ id: m.id, checksum: createHash("sha256").update(m.sql).digest("hex") }))];
    report.migrationPlan = migrationPlan;
    const before = inventory(backup), previousKeys = foreignKeys(backup);
    report.before = before; report.existingForeignKeyIssueHashes = previousKeys;
    report.ledger = backup.prepare("SELECT name FROM sqlite_master WHERE name='schema_migrations'").get() ? backup.prepare("SELECT * FROM schema_migrations ORDER BY id").all() : [];
    for (const entry of report.ledger as { id: string }[]) if (!migrationPlan.some(m => m.id === entry.id)) throw Error(`Unknown migration in source ledger: ${entry.id}`);
    const filesBefore = await fileInventory(backup); report.files = filesBefore;
    await backup.backup(restoredPath); await fs.chmod(restoredPath, 0o600);
    const restored = new Database(restoredPath, { fileMustExist: true });
    try {
      assert.deepEqual(inventory(restored), before); assert.deepEqual(foreignKeys(restored), previousKeys);
      report.applied = migrate(restored, { legacyBaseline: useLegacyBaseline });
      assert.deepEqual(migrate(restored, { legacyBaseline: useLegacyBaseline }), [], "Repeat migration must be a no-op");
      assert.equal(restored.pragma("integrity_check", { simple: true }), "ok");
      // Ledger additions are intentional; every original user table/column/row is exact.
      const userTables = before.filter(t => t.name !== "schema_migrations");
      assert.deepEqual(inventory(restored, userTables), userTables);
      for (const old of report.ledger as { id: string; checksum: string; applied_at: string }[]) assert.deepEqual(restored.prepare("SELECT * FROM schema_migrations WHERE id=?").get(old.id), old);
      assert.deepEqual(foreignKeys(restored), previousKeys, "New or changed historical FK violation");
      assert.deepEqual(await fileInventory(restored), filesBefore, "Referenced files changed during rehearsal");
      report.after = inventory(restored); report.contentPreserved = true;
      if (bootstrapArg) {
        const beforeBootstrap = inventory(restored);
        const schemaBefore = restored.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type,name").all();
        // A new process runs only the DB bootstrap, with no production secrets and only our restored copy.
        execFileSync(process.execPath, ["--import", "tsx", "-e", "const {sqlite}=require('./lib/db/client.ts'); sqlite.close();"], { cwd: process.cwd(), env: { PATH: process.env.PATH, DATABASE_PATH: restoredPath, NODE_ENV: "production" }, timeout: 30000, stdio: "pipe" });
        const schemaAfter = restored.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type,name").all();
        report.bootstrap = { schemaBefore, schemaAfter, before: beforeBootstrap, after: inventory(restored), unchanged: false };
        assert.deepEqual(inventory(restored), beforeBootstrap, "Runtime bootstrap changed data/columns; review before release");
        assert.deepEqual(schemaAfter, schemaBefore, "Runtime bootstrap changed schema; review before release");
        assert.deepEqual(foreignKeys(restored), previousKeys);
        (report.bootstrap as { unchanged: boolean }).unchanged = true;
      }
      report.ready = filesBefore.every(f => f.status === "ok");
      if (!report.ready) report.error = "Referenced files require review; see private report";
    } finally { restored.close(); }
  } finally { backup.close(); }
} catch (e) { report.error = e instanceof Error ? e.message : String(e); process.exitCode = 1; }
finally {
  source.close();
  await fs.writeFile(path.join(folder, "verification.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ report: path.join(folder, "verification.json"), ready: report.ready, contentPreserved: report.contentPreserved ?? false, error: report.error }));
  if (!report.ready) process.exitCode = 1;
}

}
main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
