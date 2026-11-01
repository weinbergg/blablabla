/* eslint-disable @typescript-eslint/no-require-imports */
// Create a disposable DB, never mutate the input database or the library files.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');
const root = path.resolve(__dirname, '../..');
(async () => {
  const artifactRoot = process.env.BLABLA_TEST_ARTIFACT_DIR || os.tmpdir();
  fs.mkdirSync(artifactRoot, { recursive: true, mode: 0o700 });
  const target = fs.mkdtempSync(path.join(artifactRoot, 'blabla-browser-'));
  fs.chmodSync(target, 0o700);
  const databasePath = path.join(target, 'test.db');
  const source = new Database(process.env.BLABLA_SOURCE_DB || path.join(root, 'data/app.db'), { readonly: true, fileMustExist: true });
  try { await source.backup(databasePath); } finally { source.close(); }
  fs.chmodSync(databasePath, 0o600);
  const db = new Database(databasePath);
  try {
    const users = {};
    const run = crypto.randomUUID().slice(0, 8);
    for (const [label, role] of [['a', 'booster'], ['b', 'member'], ['c', 'member']]) {
      const id = `audit-${run}-${label}`, token = crypto.randomBytes(32).toString('hex');
      const name = `Audit ${run} ${label}`;
      db.prepare('INSERT INTO users(id,email,name,password_hash,role) VALUES(?,?,?,?,?)').run(id, `${id}@example.invalid`, name, 'not-a-real-password', role);
      db.prepare('INSERT INTO sessions(id,user_id,expires_at) VALUES(?,?,?)').run(token, id, new Date(Date.now()+86400000).toISOString());
      users[label] = { id, token, name };
    }
    function choose(format) {
      const rows = db.prepare('SELECT id,title,file_url FROM documents WHERE file_type=? AND file_url IS NOT NULL').all(format);
      const override = process.env[`BLABLA_${format}_ID`];
      const available = rows.filter(row => (!override || row.id === override) && fs.existsSync(path.join(root, 'public', row.file_url)));
      if (format === 'PDF') available.sort((a, b) => fs.statSync(path.join(root, 'public', a.file_url)).size - fs.statSync(path.join(root, 'public', b.file_url)).size);
      if (!available[0]) throw new Error(`No local ${format} fixture; set BLABLA_${format}_ID to a real document`);
      return available[0];
    }
    const channel = { id: `browser-channel-${run}`, slug: `reading-notes-${run}`, title: 'На полях прочитанного' };
    db.prepare("INSERT INTO channels(id,slug,title,description,owner_id,kind) VALUES(?,?,?,?,?,'author')").run(channel.id, channel.slug, channel.title, 'Книги, мысли и разговоры о прочитанном.', users.a.id);
    const fixtures = { databasePath, users, channel, txt: choose('TXT'), epub: choose('EPUB'), pdf: choose('PDF') };
    const file = path.join(target, 'fixtures.json');
    fs.writeFileSync(file, JSON.stringify(fixtures, null, 2), { mode: 0o600 });
    console.log(JSON.stringify({ databasePath, fixtures: file }, null, 2));
  } finally { db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
