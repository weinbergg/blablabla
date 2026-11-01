import assert from "node:assert/strict";
import type Database from "better-sqlite3";
import { migrate } from "./migrations";
import { foreignKeys, inventory } from "./verification";

// The backup is created/restored by the owner-operated runner before this function.
// Reject intervening writes and roll back DDL if any preservation check fails.
export function applyReviewedMigration(db: Database.Database, backup: Database.Database) {
  const before = inventory(backup), keys = foreignKeys(backup);
  db.pragma("foreign_keys=ON");
  return db.transaction(() => {
    assert.deepEqual(inventory(db), before, "Database changed after backup; stop and review other writers");
    assert.deepEqual(foreignKeys(db), keys);
    const applied = migrate(db, { legacyBaseline: true });
    const userTables = before.filter(t => t.name !== "schema_migrations");
    assert.deepEqual(inventory(db, userTables), userTables, "Original rows or columns changed");
    assert.deepEqual(foreignKeys(db), keys, "Historical FK violations changed");
    assert.equal(db.pragma("integrity_check", { simple: true }), "ok");
    assert.deepEqual(migrate(db, { legacyBaseline: true }), []);
    return { applied, originalTables: userTables.length, contentPreserved: true, existingForeignKeyIssues: keys.length };
  }).immediate();
}
