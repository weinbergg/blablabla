/* eslint-disable @typescript-eslint/no-require-imports */
// Read-only inventory. Run with the existing application's Node dependencies.
// No app imports, sudo, daemon startup, migration, backup, restart or configuration writes.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { execFileSync } = require('node:child_process');
const { createHash, X509Certificate } = require('node:crypto');

function inspect(root, { system = true } = {}) {
  root = fs.realpathSync(root);
  const Database = require(require.resolve('better-sqlite3', { paths: [root] }));
  const problems = [], report = { readOnly: true, checkedAt: new Date().toISOString(), root, node: process.version, platform: process.platform, problems };
  const command = (exe, args) => { try { return execFileSync(exe, args, { encoding: 'utf8', timeout: 15000, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }); } catch { problems.push(`${exe}: unavailable or insufficient access`); return null; } };
  const stat = file => { try { const s = fs.statSync(file); return { path: file, realPath: fs.realpathSync(file), bytes: s.size, mode: (s.mode & 0o777).toString(8), uid: s.uid, gid: s.gid }; } catch { return { path: file, unavailable: true }; } };
  // Env values never enter the report. DATABASE_PATH alone is used internally to locate SQLite.
  let fileDbPath;
  report.environmentFiles = ['.env.production.local', '.env.local', '.env.production', '.env'].flatMap(name => {
    const file = path.join(root, name); if (!fs.existsSync(file)) return [];
    const entries = [...fs.readFileSync(file, 'utf8').matchAll(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z_0-9]*)\s*=\s*(.*)$/gm)];
    if (!fileDbPath) { const value = entries.find(e => e[1] === 'DATABASE_PATH')?.[2]; if (value) fileDbPath = value.trim().replace(/^(['"])(.*)\1$/, '$2'); }
    return [{ ...stat(file), names: entries.map(e => e[1]) }];
  });
  let app;
  if (system) {
    // Never invoke the PM2 CLI: even a status command may start a daemon.
    // Saved configuration is labelled as such; /proc corroborates the running process when readable.
    try {
      const pm2Root = process.env.PM2_HOME || path.join(os.homedir(), '.pm2');
      const saved = JSON.parse(fs.readFileSync(path.join(pm2Root, 'dump.pm2'), 'utf8')).find(p => p.name === 'blabla');
      if (!saved) throw Error();
      const e = saved.pm2_env || saved;
      let pid = null, liveCwd = null, liveEnv = null, liveExecutable = null;
      try {
        pid = Number(fs.readFileSync(e.pm_pid_path, 'utf8').trim());
        if (!Number.isSafeInteger(pid) || pid < 2) throw Error();
        process.kill(pid, 0);
        liveCwd = fs.realpathSync(`/proc/${pid}/cwd`);
        if (liveCwd !== root) throw Error('Different application process');
        liveExecutable = fs.realpathSync(`/proc/${pid}/exe`);
        liveEnv = Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0').filter(Boolean).map(entry => { const at = entry.indexOf('='); return [entry.slice(0, at), entry.slice(at + 1)]; }));
      } catch { problems.push('Saved PM2 process could not be corroborated through /proc'); }
      const runtime = liveEnv || e;
      app = { pm2_env: runtime };
      report.pm2 = { name: saved.name, savedConfigurationOnly: !liveEnv, pid, liveCwd, liveExecutable, savedCwd: e.pm_cwd, script: e.pm_exec_path, interpreter: e.exec_interpreter, mode: e.exec_mode, instances: e.instances, savedNodeVersion: e.node_version,
        environmentNames: Object.keys(liveEnv || e.env || {}).sort(), configuration: Object.fromEntries(['NODE_ENV', 'DATABASE_PATH', 'NEXT_DIST_DIR', 'PORT', 'HOSTNAME', 'FILE_SERVE_MODE'].filter(k => runtime[k] !== undefined).map(k => [k, runtime[k]])) };
      if (liveCwd && liveCwd !== root) problems.push('Running process cwd differs from supplied application root');
      if (!liveEnv) problems.push('PM2 dump is not proof of current process settings');
    } catch { problems.push('PM2 saved configuration not accessible; no daemon was queried or started'); }
    const nginx = command('nginx', ['-T']);
    if (nginx) {
      // Whitelist filesystem/routing/TLS declarations. Headers and credentials are deliberately excluded.
      report.nginx = nginx.split('\n').map(line => line.trim()).filter(line => /^(?:# configuration file |(?:server_name|listen|location|alias|root|ssl_certificate|ssl_certificate_key|internal|return 404)\b)/.test(line));
      const certs = [...nginx.matchAll(/^\s*ssl_certificate\s+([^;]+);/gm)].map(m => m[1].trim());
      report.certificates = [...new Set(certs)].map(file => { try { const cert = new X509Certificate(fs.readFileSync(file)); return { path: file, validFrom: cert.validFrom, validTo: cert.validTo, fingerprint: cert.fingerprint256 }; } catch { return { path: file, readable: false }; } });
    }
    const cron = command('crontab', ['-l']);
    if (cron) report.cron = { entryCount: cron.split('\n').filter(line => line.trim() && !line.trim().startsWith('#')).length, mentionsBilling: /billing/.test(cron), mentionsImports: /import|seed|migrate/.test(cron), fullCommandsOmitted: true };
  }
  const dbPath = path.resolve(root, app?.pm2_env?.DATABASE_PATH || fileDbPath || 'data/app.db');
  report.database = stat(dbPath);
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  const quote = name => `"${name.replaceAll('"', '""')}"`;
  try {
    report.database.sqliteVersion = db.prepare('SELECT sqlite_version() AS v').get().v;
    report.database.journalMode = db.pragma('journal_mode', { simple: true });
    report.database.quickCheck = db.pragma('quick_check', { simple: true });
    const schema = db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type,name").all();
    report.database.schemaHash = createHash('sha256').update(JSON.stringify(schema)).digest('hex');
    report.database.tables = schema.filter(r => r.type === 'table' && !r.name.startsWith('sqlite_')).map(r => ({ name: r.name, count: db.prepare(`SELECT count(*) AS n FROM ${quote(r.name)}`).get().n, columns: db.pragma(`table_info(${quote(r.name)})`).map(c => ({ name: c.name, type: c.type })) }));
    report.database.foreignKeyIssues = db.pragma('foreign_key_check').length;
    const tables = new Set(report.database.tables.map(t => t.name));
    report.database.migrations = tables.has('schema_migrations') ? db.prepare('SELECT id,checksum,applied_at FROM schema_migrations ORDER BY id').all() : null;
    if (tables.has('users')) {
      report.database.roles = db.prepare('SELECT role,count(*) AS count FROM users GROUP BY role').all();
      report.database.legacyTestAccountCount = db.prepare("SELECT count(*) AS n FROM users WHERE email IN ('admin@test.local','booster@test.local','member@test.local')").get().n;
    }
    if (tables.has('site_settings')) {
      const raw = db.prepare("SELECT value FROM site_settings WHERE key='feature_flags'").get()?.value;
      try { const settings = JSON.parse(raw || '{}'); report.featureFlags = { modes: settings.modes || {}, testerCount: Array.isArray(settings.testerIds) ? settings.testerIds.length : 0 }; } catch { problems.push('Invalid feature_flags JSON'); }
    }
  } finally { db.close(); }
  report.storage = ['data', 'public/uploads', 'data/community-uploads', 'data/music-uploads', 'static-assets', '.next'].map(name => stat(path.join(root, name)));
  report.otherWritersConfirmed = false;
  report.snapshotConsistent = false;
  report.releaseReady = false;
  return report;
}
module.exports = { inspect };
if (require.main === module || process.argv[1] === '-') {
  try {
    if (!process.argv[2] || process.argv.length !== 3) throw Error('Usage: node scripts/inspect-production.cjs /absolute/application/root');
    process.stdout.write(JSON.stringify(inspect(process.argv[2]), null, 2) + '\n');
  } catch { console.error('Inventory incomplete. Check root, read permissions and installed better-sqlite3; no application changes were made.'); process.exitCode = 1; }
}
