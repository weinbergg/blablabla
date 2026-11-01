import type Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// Explicit opt-in for the owner's schema-only export. No runtime app import.
const sourceSchema = "6e57554ce9ce0701fb879120e83945246e34853a226d1e94cad57be317973a3c";
const sql = readFileSync(new URL("./legacy-baseline.sql", import.meta.url), "utf8");
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
export const legacyBaseline = {
  id: "20261029_00_legacy_baseline",
  checksum: sha(`${sourceSchema}\n${sql}`),
};

// Called inside the same transaction as the three existing migrations.
export function applyLegacyBaseline(db: Database.Database): string[] {
  const hasLedger = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get();
  if (hasLedger) {
    const prior = db.prepare("SELECT checksum FROM schema_migrations WHERE id=?").get(legacyBaseline.id) as { checksum: string } | undefined;
    if (prior) {
      if (prior.checksum !== legacyBaseline.checksum) throw Error(`Migration checksum mismatch: ${legacyBaseline.id}`);
      return [];
    }
  }
  const schema = db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
  if (sha(JSON.stringify(schema)) !== sourceSchema) throw Error("Legacy baseline requires the exact reviewed 2026-10-29 schema; no changes made");
  db.exec(sql);
  db.exec("CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
  db.prepare("INSERT INTO schema_migrations(id,checksum) VALUES(?,?)").run(legacyBaseline.id, legacyBaseline.checksum);
  return [legacyBaseline.id];
}
