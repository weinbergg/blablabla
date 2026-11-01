/* eslint-disable @typescript-eslint/no-require-imports */
// Owner-run read-only report. Does NOT import application/bootstrap or change either DB.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const Database = require('better-sqlite3');
const { testRoot } = require('./paths.cjs');
const root = testRoot(process.cwd()), marker = JSON.parse(fs.readFileSync(path.join(root,'data/test-instance.json')));
if (process.argv[2] !== '/var/www/blabla/data/app.db') throw Error('Usage from test app: node deploy/test/isolation-report.cjs /var/www/blabla/data/app.db');
const productionPath = fs.realpathSync(process.argv[2]), testPath = path.join(root,'data/app.db');
if (productionPath === fs.realpathSync(testPath) || fs.statSync(productionPath).ino === fs.statSync(testPath).ino && fs.statSync(productionPath).dev === fs.statSync(testPath).dev) throw Error('Shared database refused');
const current = new Database(testPath, { readonly:true, fileMustExist:true });
const production = new Database(productionPath, { readonly:true, fileMustExist:true });
try {
  const ids = current.prepare('SELECT id FROM users').all().map(u => u.id);
  const hits = ids.reduce((n,id) => n + production.prepare('SELECT count(*) n FROM users WHERE id=?').get(id).n,0);
  const tables = new Set(production.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t=>t.name));
  const settings = tables.has('site_settings') ? production.prepare('SELECT * FROM site_settings ORDER BY key').all() : [];
  const settingsSha256 = crypto.createHash('sha256').update(JSON.stringify(settings)).digest('hex');
  const userContentInProduction = {};
  for (const table of ['annotations','comments','channel_posts','channel_comments','forum_topics','forum_posts']) {
    if (!tables.has(table)) { userContentInProduction[table] = 0; continue; }
    const placeholders = ids.map(()=>'?').join(',');
    userContentInProduction[table] = production.prepare(`SELECT count(*) n FROM ${table} WHERE author_id IN (${placeholders})`).get(...ids).n;
  }
  console.log(JSON.stringify({ instanceId:marker.instanceId, testPath, productionPath, testUsersInProduction:hits, userContentInProduction, productionSettingsSha256:settingsSha256, testIntegrity:current.pragma('integrity_check',{simple:true}), testForeignKeys:current.pragma('foreign_key_check').length, fileIsolation:marker.books.every(b => fs.statSync(path.join(root,'public/uploads',b.file)).nlink===1) },null,2));
  if (hits || Object.values(userContentInProduction).some(Boolean)) process.exitCode=1;
} finally { current.close(); production.close(); }
