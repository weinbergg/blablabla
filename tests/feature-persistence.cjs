/* eslint-disable @typescript-eslint/no-require-imports */
// Filesystem/process integration, deliberately separate from browser acceptance.
const Database = require('better-sqlite3'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), { execFileSync } = require('node:child_process');
if (!process.env.BLABLA_TEST_FIXTURES) throw Error('Disposable fixtures required');
const f = JSON.parse(fs.readFileSync(process.env.BLABLA_TEST_FIXTURES)), root = path.resolve(path.dirname(process.env.BLABLA_TEST_FIXTURES));
if (!path.basename(root).startsWith('blabla-browser-') || path.resolve(f.databasePath) !== path.join(root, 'test.db')) throw Error('Disposable fixture DB only');
(async () => {
  const folder = fs.mkdtempSync(path.join(root, 'flags-restart-')); fs.chmodSync(folder, 0o700);
  const target = path.join(folder, 'copy.db'), source = new Database(f.databasePath, { readonly: true, fileMustExist: true });
  try { await source.backup(target); } finally { source.close(); }
  const db = new Database(target), values = ['off', 'admins', 'testers', 'on'];
  const keys = ['channels','channel_creation','feed','forum','comments','rooms','room_creation','host_programs','paid_events','experimental'];
  const flags = { modes: Object.fromEntries(keys.map((key, i) => [key, values[i % values.length]])), testerIds: [f.users.a.id] };
  const serialized = JSON.stringify(flags);
  db.prepare("INSERT INTO site_settings(key,value) VALUES('feature_flags',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(serialized); db.close();
  const code = "const {sqlite}=require('./lib/db/client.ts'); const {migrate}=require('./lib/db/migrations.ts'); migrate(sqlite); process.stdout.write(sqlite.prepare(\"SELECT value FROM site_settings WHERE key='feature_flags'\").get().value); sqlite.close();";
  for (let i = 0; i < 2; i++) {
    const output = execFileSync(process.execPath, ['--import', 'tsx', '-e', code], { env: { ...process.env, DATABASE_PATH: target, NODE_ENV: 'production' }, encoding: 'utf8' });
    assert.equal(output, serialized, 'Bootstrap/restart/migration changed flags');
  }
  fs.writeFileSync(path.join(root, 'feature-persistence-results.json'), JSON.stringify({ ok: true, checks: ['all ten settings', 'four modes', 'two fresh process production bootstraps', 'repeat explicit migrations', 'settings unchanged'], copy: target }));
  console.log('Feature settings persisted across two fresh production bootstraps and migration checks (copy only)');
})().catch(e => { console.error(e); process.exitCode = 1; });
