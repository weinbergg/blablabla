/* eslint-disable @typescript-eslint/no-require-imports */
const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');

// Never import the app DB client: it has legacy runtime schema changes.
(async () => {
  const source = new Database(process.argv[2] || 'data/app.db', { readonly: true, fileMustExist: true });
  const folder = fs.mkdtempSync(path.join(process.argv[3] || os.tmpdir(), 'blabla-backup-'));
  fs.chmodSync(folder, 0o700);
  const backupPath = path.join(folder, 'backup.db');
  const restoredPath = path.join(folder, 'restored.db');
  function inventory(db) {
    return db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
      .map(({ name }) => [name, db.prepare(`SELECT count(*) AS n FROM "${name.replaceAll('"', '""')}"`).get().n]);
  }
  try {
    await source.backup(backupPath);
    const backup = new Database(backupPath, { readonly: true });
    try {
      assert.equal(backup.pragma('integrity_check', { simple: true }), 'ok');
      await backup.backup(restoredPath);
      const restored = new Database(restoredPath, { readonly: true });
      try {
        assert.equal(restored.pragma('integrity_check', { simple: true }), 'ok');
        assert.deepEqual(inventory(restored), inventory(backup));
        assert.deepEqual(restored.pragma('foreign_key_check'), backup.pragma('foreign_key_check'));
        const report = { backupPath, restoredPath, integrity: 'ok', tables: inventory(restored), existingForeignKeyIssues: restored.pragma('foreign_key_check').length };
        fs.writeFileSync(path.join(folder, 'verification.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
        console.log(JSON.stringify({ backupPath, restoredPath, integrity: 'ok', tables: report.tables.length, existingForeignKeyIssues: report.existingForeignKeyIssues }, null, 2));
      } finally { restored.close(); }
    } finally { backup.close(); }
    fs.chmodSync(backupPath, 0o600); fs.chmodSync(restoredPath, 0o600);
  } finally { source.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
