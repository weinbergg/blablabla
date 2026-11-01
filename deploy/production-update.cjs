/* eslint-disable @typescript-eslint/no-require-imports */
// One-off owner-operated release. No production mutation in --prepare.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const ROOT = '/var/www/blabla';
const PRIVATE = '/srv/blabla-release-qhq2Vhh0';
const STATE = `${PRIVATE}/production-update.json`;
const ARTIFACT = '/srv/blabla-test/incoming/blabla-test-linux.tar.gz';
const ARTIFACT_SHA = '6c51386d60a4d7cdc989c699189a46b4dbca4966948c05b39c4bcfa27edc532d';
const PROOF = `${PRIVATE}/release-check-wVA4k0/verification.json`;
const PM2 = '/usr/bin/pm2';
const TOOL_ROOT = path.resolve(__dirname, '..');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const check = (condition, message) => { if (!condition) throw Error(message); };
function run(exe, args, options = {}) {
  const result = spawnSync(exe, args, { encoding: 'utf8', timeout: 120000, maxBuffer: 32 * 1024 * 1024, ...options });
  check(result.status === 0, `${path.basename(exe)} failed; exit=${result.status ?? result.signal ?? result.error?.code}`);
  return result.stdout;
}
function save(state) {
  const temp = `${STATE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(temp, STATE);
}
function safeEnvironment(env) {
  // /proc/<pid>/environ includes Node's original IPC descriptors even after Node
  // removes them from process.env. A new child must not reuse the old PM2 pipe.
  return Object.fromEntries(Object.entries(env).filter(([key, value]) => /^[A-Z_][A-Z0-9_]*$/.test(key) && !/^(PM2_|NODE_APP_INSTANCE$|NODE_CHANNEL_FD$|NODE_CHANNEL_SERIALIZATION_MODE$)/.test(key) && typeof value === 'string'));
}
function processConfig(app, cwd) {
  const e = app.pm2_env;
  check(e.exec_mode === 'fork_mode' && e.exec_interpreter === '/usr/bin/node', 'Unexpected PM2 interpreter or mode');
  const config = { name: 'blabla', cwd, script: path.join(cwd, 'node_modules/next/dist/bin/next'),
    args: cwd === ROOT ? e.args : ['start', '--hostname', '127.0.0.1', '--port', '3000'],
    interpreter: '/usr/bin/node', instances: 1, exec_mode: 'fork',
    env: safeEnvironment(e.env || {}), autorestart: e.autorestart !== false };
  for (const key of ['node_args', 'kill_timeout', 'max_restarts', 'min_uptime', 'restart_delay', 'max_memory_restart', 'merge_logs', 'time', 'log_date_format']) {
    if (e[key] !== undefined) config[key] = e[key];
  }
  return { apps: [config] };
}
function application(allowMissing = false) {
  const daemon = Number(fs.readFileSync('/root/.pm2/pm2.pid', 'utf8').trim());
  check(Number.isSafeInteger(daemon) && daemon > 1, 'PM2 daemon PID is invalid'); process.kill(daemon, 0);
  const apps = JSON.parse(run(PM2, ['jlist'])).filter(p => p.name === 'blabla');
  if (allowMissing && apps.length === 0) return null;
  check(apps.length === 1, 'Expected exactly one PM2 application named blabla');
  return apps[0];
}
function otherDatabaseUsers(allowedPid) {
  const found = [];
  for (const pid of fs.readdirSync('/proc').filter(p => /^\d+$/.test(p))) {
    if (Number(pid) === allowedPid || Number(pid) === process.pid) continue;
    let fds; try { fds = fs.readdirSync(`/proc/${pid}/fd`); } catch { continue; }
    for (const fd of fds) {
      let target; try { target = fs.readlinkSync(`/proc/${pid}/fd/${fd}`); } catch { continue; }
      if (target.startsWith(`${ROOT}/data/`) || target.startsWith(`${ROOT}/public/uploads/`)) { found.push(Number(pid)); break; }
    }
  }
  return found;
}
function scheduledWriters() {
  const candidates = [];
  const relevant = content => content.split('\n').filter(l => !l.trim().startsWith('#')).some(l => /\/var\/www\/blabla|blablablarden|billing-tick|bulk-import|\/api\/cron/.test(l));
  const cron = spawnSync('/usr/bin/crontab', ['-l'], { encoding: 'utf8' });
  check(cron.status === 0 || (cron.status === 1 && /no crontab/i.test(cron.stderr)), 'Cannot verify root crontab');
  if (cron.status === 0 && relevant(cron.stdout)) candidates.push('root crontab');
  for (const directory of ['/etc/cron.d', '/etc/cron.hourly', '/etc/cron.daily', '/etc/cron.weekly', '/etc/cron.monthly', '/var/spool/cron/crontabs', '/etc/systemd/system']) {
    for (const name of fs.existsSync(directory) ? fs.readdirSync(directory) : []) {
      const file = path.join(directory, name), stat = fs.lstatSync(file);
      if (stat.isFile() && stat.size < 1024 * 1024 && relevant(fs.readFileSync(file, 'utf8'))) candidates.push(file);
    }
  }
  if (fs.existsSync('/etc/crontab') && relevant(fs.readFileSync('/etc/crontab', 'utf8'))) candidates.push('/etc/crontab');
  return candidates;
}
function preflight() {
  check(process.platform === 'linux' && process.arch === 'x64' && process.getuid() === 0, 'Run on the approved Linux VPS as root');
  check(process.version === 'v20.20.2', 'Node version differs from the verified build');
  check(fs.realpathSync(ROOT) === ROOT && fs.realpathSync(`${ROOT}/data/app.db`) === `${ROOT}/data/app.db`, 'Unexpected production paths');
  check(!fs.existsSync(`${ROOT}/data/test-instance.json`), 'Production contains a test instance marker');
  const app = application();
  check(app.pm2_env.status === 'online' && app.pm2_env.pm_cwd === ROOT, 'Production process changed; do not overwrite');
  check(fs.realpathSync(`/proc/${app.pid}/cwd`) === ROOT, 'Cannot corroborate production process');
  check(app.pm2_env.pm_exec_path === `${ROOT}/node_modules/next/dist/bin/next`, 'Unexpected production script');
  const runtime = Object.fromEntries(fs.readFileSync(`/proc/${app.pid}/environ`, 'utf8').split('\0').filter(Boolean).map(v => { const at = v.indexOf('='); return [v.slice(0, at), v.slice(at + 1)]; }));
  check(!runtime.DATABASE_PATH || path.resolve(ROOT, runtime.DATABASE_PATH) === `${ROOT}/data/app.db`, 'Unexpected DATABASE_PATH');
  check(!runtime.NEXT_DIST_DIR || runtime.NEXT_DIST_DIR === '.next', 'Unexpected build directory');
  check(runtime.NODE_ENV === 'production' && runtime.PORT === '3000' && runtime.FILE_SERVE_MODE === 'xaccel', 'Unexpected production environment');
  // Preserve actual initial environment, including credentials supplied via PM2.
  app.pm2_env.env = safeEnvironment(runtime);
  const writers = otherDatabaseUsers(app.pid), jobs = scheduledWriters();
  check(!writers.length, `Other storage users must finish before switching: PIDs ${writers.join(',')}`);
  check(!jobs.length, `Review scheduled writers before switching: ${jobs.join(',')}`);
  run('/usr/sbin/nginx', ['-t']);
  // Validate the existing TLS virtual host locally even while public DNS is broken.
  const httpsStatus = run('/usr/bin/curl', ['--silent', '--show-error', '--max-time', '15', '--resolve', 'blablablarden.ru:443:127.0.0.1', '--output', '/dev/null', '--write-out', '%{http_code}', 'https://blablablarden.ru/']);
  check(/^[23]\d\d$/.test(httpsStatus), `Existing HTTPS virtual host returned ${httpsStatus}; review before switching`);
  const proof = json(PROOF);
  check(proof.ready === true && proof.contentPreserved === true && proof.bootstrap?.unchanged === true && proof.applied?.length === 4, 'Successful owner rehearsal report is required');
  check(proof.sourcePath === `${PRIVATE}/blabla-backup-DkuxrS/backup.db`, 'Unexpected rehearsal source');
  // A Git checkout can use the uploaded artifact without generating a new build/kit.
  // No dependencies from the writable test instance are executed as root.
  const planFile = fs.existsSync(`${TOOL_ROOT}/release-kit.json`) ? `${TOOL_ROOT}/release-kit.json` : `${TOOL_ROOT}/deploy/release-plan.json`;
  const expected = json(planFile).migrationPlan;
  check(JSON.stringify(proof.migrationPlan) === JSON.stringify(expected), 'Rehearsal migration checksums differ from this package');
  const disk = fs.statfsSync(PRIVATE);
  check(disk.bavail * disk.bsize > 2 * 1024 ** 3, 'At least 2 GiB of free disk is required for the staged release');
  return app;
}
function fileList(root) {
  const result = [];
  function walk(relative) {
    for (const name of fs.readdirSync(path.join(root, relative))) {
      const item = path.join(relative, name), stat = fs.lstatSync(path.join(root, item));
      check(!stat.isSymbolicLink(), `Unexpected static symlink: ${item}`);
      if (stat.isDirectory()) walk(item); else { check(stat.isFile(), 'Unexpected static file type'); result.push(item); }
    }
  }
  walk(''); return result;
}
function appendStatic(source, destination, write = false) {
  const files = fileList(source);
  for (const item of files) {
    const from = path.join(source, item), to = path.join(destination, item);
    let cursor = path.dirname(to);
    while (cursor.startsWith(destination)) {
      if (fs.existsSync(cursor)) check(fs.lstatSync(cursor).isDirectory() && !fs.lstatSync(cursor).isSymbolicLink(), 'Unexpected static storage path');
      if (cursor === destination) break; cursor = path.dirname(cursor);
    }
    if (fs.existsSync(to)) {
      check(fs.lstatSync(to).isFile() && !fs.lstatSync(to).isSymbolicLink() && sha(fs.readFileSync(from)) === sha(fs.readFileSync(to)), `Static filename collision: ${item}`);
    } else if (write) {
      const firstCreated = fs.mkdirSync(path.dirname(to), { recursive: true, mode: 0o755 });
      if (firstCreated) {
        let directory = path.dirname(to);
        while (directory.startsWith(firstCreated)) {
          fs.chmodSync(directory, 0o755);
          if (directory === firstCreated) break;
          directory = path.dirname(directory);
        }
      }
      fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL); fs.chmodSync(to, 0o644);
    }
  }
  return files.length;
}
function copyEnvironment(release) {
  const snapshots = [];
  for (const name of ['.env.production.local', '.env.local', '.env.production', '.env']) {
    const from = path.join(ROOT, name);
    if (!fs.existsSync(from)) { snapshots.push({ name, sha256: null }); continue; }
    check(fs.lstatSync(from).isFile(), `Unexpected environment file type: ${name}`);
    const value = fs.readFileSync(from);
    const to = path.join(release, name);
    fs.writeFileSync(to, value, { mode: 0o600, flag: 'wx' });
    snapshots.push({ name, sha256: sha(value) });
  }
  return snapshots;
}
function memoryForBuild(meminfo) {
  const kib = name => Number(meminfo.match(new RegExp(`^${name}:\\s+(\\d+)`, 'm'))?.[1] || 0);
  // Build cgroup: 950 MiB RAM, with at least 300 MiB of available headroom.
  check(kib('MemAvailable') >= 1280000 && kib('SwapFree') >= 1048576, 'Build requires 1250 MiB available RAM and 1024 MiB free swap; production has not been stopped');
}
function buildGit(commit) {
  check(TOOL_ROOT === `${PRIVATE}/git-source`, 'Use the private git-source checkout');
  check(/^[0-9a-f]{40}$/.test(commit || ''), 'A full commit SHA is required');
  check(!fs.existsSync(STATE), 'A preparation already exists; use --status');
  const git = args => run('/usr/bin/git', args, { cwd: TOOL_ROOT }).trim();
  check(git(['rev-parse', 'HEAD']) === commit, 'Checkout does not match the approved commit');
  check(git(['status', '--porcelain', '--untracked-files=all', '--', '.', ':!release-kit.json', ':!git-build.json']) === '', 'Git checkout must be clean');
  check(git(['remote', 'get-url', 'origin']) === 'https://github.com/weinbergg/blablabla.git', 'Unexpected source repository');
  check(process.version === 'v20.20.2' && process.arch === 'x64', 'Use the reviewed Node 20.20.2 / Linux x64 builder');
  if (fs.existsSync(`${TOOL_ROOT}/git-build.json`)) {
    const built = json(`${TOOL_ROOT}/git-build.json`);
    check(built.gitCommit === commit && built.work.startsWith(`${PRIVATE}/production-code-`) && built.code === `${built.work}/app` && fs.realpathSync(built.code) === built.code, 'Unexpected saved build');
    check(json(`${built.code}/build-info.json`).gitCommit === commit, 'Saved build does not match the commit');
    console.log(`BUILD_REUSED: ${commit}`); return built;
  }
  for (const unit of ['blabla-test-tunnel.service', 'blabla-test.service']) {
    const status = spawnSync('/usr/bin/systemctl', ['is-active', unit], { encoding: 'utf8' });
    if (['active', 'activating', 'reloading'].includes(status.stdout.trim())) run('/usr/bin/systemctl', ['stop', unit]);
  }
  memoryForBuild(fs.readFileSync('/proc/meminfo', 'utf8'));
  const disk = fs.statfsSync(PRIVATE);
  check(disk.bavail * disk.bsize >= 4 * 1024 ** 3, 'Build requires 4 GiB free disk');
  const work = fs.mkdtempSync(`${PRIVATE}/production-code-`), code = `${work}/app`;
  fs.mkdirSync(code, { mode: 0o700 });
  git(['archive', '--format=tar', `--output=${work}/source.tar`, commit]);
  run('/usr/bin/tar', ['--no-same-owner', '-xf', `${work}/source.tar`, '-C', code]);
  check(!fs.existsSync(`${code}/data`), 'Committed source unexpectedly contains data');
  const uploads = `${code}/public/uploads`;
  check(fs.readdirSync(uploads).every(name => name === '.gitkeep'), 'Committed source unexpectedly contains uploads');
  fs.unlinkSync(`${uploads}/.gitkeep`); fs.rmdirSync(uploads);
  for (const name of ['.env.production.local', '.env.local', '.env.production', '.env']) check(!fs.existsSync(`${code}/${name}`), 'Committed source contains environment');
  fs.mkdirSync(`${work}/build-data`, { mode: 0o700 });
  // Heap can exceed the RAM cap using the builder's bounded swap allowance.
  const env = { PATH: '/usr/bin:/bin', npm_config_cache: `${work}/npm-cache`, NEXT_TELEMETRY_DISABLED: '1', NODE_OPTIONS: '--max-old-space-size=1024' };
  const buildEnv = { ...env, NODE_ENV: 'production', DATABASE_PATH: `${work}/build-data/app.db`, BLABLA_LOW_MEMORY_BUILD: '1' };
  console.log(`BUILD_START: ${commit}; isolated database, no production environment or preview server`);
  const options = { cwd: code, env, timeout: 1800000, stdio: ['ignore', 'inherit', 'inherit'] };
  run('/usr/bin/npm', ['ci', '--no-audit', '--no-fund'], options);
  run(process.execPath, ['--import', 'tsx', 'scripts/build-database.ts', '--empty-build-only', buildEnv.DATABASE_PATH], { ...options, env: buildEnv });
  run('/usr/bin/npm', ['run', 'build'], { ...options, env: buildEnv });
  const migrationPlan = JSON.parse(run(process.execPath, ['--import', 'tsx', '-e', "const {migrations}=require('./lib/db/migrations.ts'); const {legacyBaseline}=require('./lib/db/legacy-baseline.ts'); const {createHash}=require('node:crypto'); console.log(JSON.stringify([legacyBaseline,...migrations.map(m=>({id:m.id,checksum:createHash('sha256').update(m.sql).digest('hex')}))]));"], { cwd: code, env }));
  fs.writeFileSync(`${TOOL_ROOT}/release-kit.json`, JSON.stringify({ gitCommit: commit, migrationPlan }), { mode: 0o600, flag: 'wx' });
  fs.writeFileSync(`${code}/build-info.json`, JSON.stringify({ platform: process.platform, arch: process.arch, node: process.version, gitCommit: commit, productionDataIncluded: false }), { mode: 0o600, flag: 'wx' });
  const built = { work, code, gitCommit: commit };
  fs.writeFileSync(`${TOOL_ROOT}/git-build.json`, JSON.stringify(built), { mode: 0o600, flag: 'wx' });
  console.log(`BUILD_OK: ${commit}`);
  return built;
}
async function prepare(built) {
  check(!fs.existsSync(STATE), 'Preparation already exists; use --status, do not overwrite');
  const app = preflight();
  const work = built?.work || fs.mkdtempSync(`${PRIVATE}/production-code-`); fs.chmodSync(work, 0o700);
  // The archive is already on the VPS. Copy into root-only storage before checking/extracting.
  const code = built?.code || `${work}/app`;
  if (!built) {
    const archive = `${work}/source.tar.gz`; fs.copyFileSync(ARTIFACT, archive);
    check(run('/usr/bin/sha256sum', [archive]).split(/\s/)[0] === ARTIFACT_SHA, 'Linux artifact checksum mismatch');
    fs.mkdirSync(code, { mode: 0o700 });
    run('/usr/bin/tar', ['--no-same-owner', '-xzf', archive, '-C', code], { timeout: 180000 });
  }
  check(!fs.existsSync(`${code}/data`) && !fs.existsSync(`${code}/public/uploads`), 'Artifact contains data/uploads');
  for (const name of ['.env.production.local', '.env.local', '.env.production', '.env']) check(!fs.existsSync(`${code}/${name}`), 'Artifact contains environment');
  check(fs.readFileSync(`${code}/.next/BUILD_ID`, 'utf8').trim(), 'Missing Next build');
  const build = json(`${code}/build-info.json`);
  check(build.platform === 'linux' && build.arch === 'x64' && build.node === process.version && build.productionDataIncluded === false, 'Build metadata mismatch');
  const routes = Object.keys(json(`${code}/.next/prerender-manifest.json`).routes);
  check(routes.every(p => ['/favicon.ico', '/_not-found'].includes(p)), 'Review unexpected prerendered application data');
  fs.symlinkSync(`${ROOT}/data`, `${code}/data`);
  fs.symlinkSync(`${ROOT}/public/uploads`, `${code}/public/uploads`);
  const environments = copyEnvironment(code);
  const oldConfig = processConfig(app, ROOT), newConfig = processConfig(app, code);
  const effective = JSON.parse(run(process.execPath, ['-e', "require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});console.log(JSON.stringify({database:process.env.DATABASE_PATH||'data/app.db',dist:process.env.NEXT_DIST_DIR||'.next',files:process.env.FILE_SERVE_MODE}));"], { cwd: code, env: newConfig.apps[0].env }));
  check(fs.realpathSync(path.resolve(code, effective.database)) === `${ROOT}/data/app.db`, 'Release environment points to a different database');
  check(effective.dist === '.next' && effective.files === 'xaccel', 'Release environment differs from the reviewed build/storage');
  const state = { phase: 'prepared', tools: TOOL_ROOT, work, code, gitCommit: built?.gitCommit, preparedAt: new Date().toISOString(), originalPid: app.pid,
    oldConfig: `${work}/previous-pm2.json`, newConfig: `${work}/next-pm2.json`, environments,
    staticFiles: appendStatic(`${code}/.next/static`, `${ROOT}/static-assets`) };
  fs.writeFileSync(state.oldConfig, JSON.stringify(oldConfig), { mode: 0o600 });
  fs.writeFileSync(state.newConfig, JSON.stringify(newConfig), { mode: 0o600 });
  fs.copyFileSync('/root/.pm2/dump.pm2', `${work}/previous-dump.pm2`); fs.chmodSync(`${work}/previous-dump.pm2`, 0o600);
  check(!fs.existsSync(`${TOOL_ROOT}/node_modules`) && !fs.lstatSync(`${TOOL_ROOT}/node_modules`, { throwIfNoEntry: false }), 'Unexpected tools dependencies');
  fs.symlinkSync(`${code}/node_modules`, `${TOOL_ROOT}/node_modules`);
  save(state);
  console.log(JSON.stringify({ status: 'UPDATE_PREPARED', state: STATE, release: code, staticFiles: state.staticFiles, productionChanged: false }));
}
async function healthy(includeFeatures = true) {
  let last = 'No response';
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      let home;
      for (const route of includeFeatures ? ['/', '/login', '/api/features'] : ['/']) {
        const r = await fetch(`http://127.0.0.1:3000${route}`, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
        check(r.status === 200, `HTTP ${r.status} at ${route}`);
        const body = await r.text(); if (route === '/') home = body;
      }
      return home;
    } catch (error) { last = error.message; await new Promise(resolve => setTimeout(resolve, 1000)); }
  }
  throw Error(`Application readiness failed: ${last}`);
}
function checkHttpsAssets(html, code) {
  const assets = [...new Set([...html.matchAll(/(?:src|href)="([^"?#]+\.(?:js|css))(?:[^\"]*)"/g)].map(m => m[1]).filter(p => p.startsWith('/_next/static/')))];
  check(assets.some(p => p.endsWith('.css')) && assets.some(p => p.endsWith('.js')), 'Missing CSS/JS in rendered homepage');
  for (const asset of assets) {
    const file = path.resolve(code, '.next/static', decodeURIComponent(asset.slice('/_next/static/'.length)));
    check(file.startsWith(`${code}/.next/static/`), 'Unexpected asset path');
    const bytes = run('/usr/bin/curl', ['--fail', '--silent', '--show-error', '--globoff', '--max-time', '15', '--resolve', 'blablablarden.ru:443:127.0.0.1', `https://blablablarden.ru${asset}`], { encoding: null });
    check(sha(bytes) === sha(fs.readFileSync(file)), `HTTPS asset mismatch: ${asset}`);
  }
  return assets.length;
}
function restoreCode(state) {
  const current = application(true);
  if (current) {
    check([ROOT, state.code].includes(current.pm2_env.pm_cwd), 'Unexpected running version; automatic rollback refused');
    run(PM2, ['delete', 'blabla']);
  }
  run(PM2, ['start', state.oldConfig, '--only', 'blabla']);
  run(PM2, ['save']);
  state.phase = 'rolled-back'; save(state);
}
async function apply() {
  check(fs.existsSync(STATE), 'Update is not prepared: --prepare must finish with UPDATE_PREPARED first; production has not been stopped');
  const state = json(STATE);
  check(state.phase === 'prepared', 'Update is not prepared; use --status');
  const app = preflight();
  check(app.pid === state.originalPid, 'Production restarted since preparation; review before updating');
  for (const item of state.environments) check((fs.existsSync(`${ROOT}/${item.name}`) ? sha(fs.readFileSync(`${ROOT}/${item.name}`)) : null) === item.sha256, 'Production environment changed after preparation');
  check(JSON.stringify(processConfig(app, ROOT)) === JSON.stringify(json(state.oldConfig)), 'PM2 configuration changed after preparation');
  for (const unit of ['blabla-test-tunnel.service', 'blabla-test.service']) {
    const status = spawnSync('/usr/bin/systemctl', ['is-active', unit], { encoding: 'utf8' });
    if (['active', 'activating', 'reloading'].includes(status.stdout.trim())) run('/usr/bin/systemctl', ['stop', unit]);
  }
  let stopped = false;
  try {
    state.phase = 'stopping'; save(state);
    stopped = true; run(PM2, ['stop', 'blabla']);
    check(otherDatabaseUsers().length === 0, 'Another process still has production storage open');
    const backup = JSON.parse(run(process.execPath, ['scripts/backup-sqlite.cjs', `${ROOT}/data/app.db`, state.work], { cwd: TOOL_ROOT }));
    state.backup = backup; state.phase = 'backed-up'; save(state);
    console.log('FINAL_BACKUP_OK');
    run(process.execPath, ['--import', 'tsx', 'scripts/release-database.ts', '--apply-reviewed-production', `${ROOT}/data/app.db`, backup.backupPath, `${state.work}/migration.json`], { cwd: TOOL_ROOT });
    state.phase = 'migrated'; save(state);
    appendStatic(`${state.code}/.next/static`, `${ROOT}/static-assets`, true);
    run(PM2, ['delete', 'blabla']);
    run(PM2, ['start', state.newConfig, '--only', 'blabla']);
    state.phase = 'started'; save(state);
    const html = await healthy();
    state.httpsAssets = checkHttpsAssets(html, state.code);
    const active = application(); check(active.pm2_env.pm_cwd === state.code, 'Unexpected active release');
    run(PM2, ['save']);
    state.phase = 'complete'; state.completedAt = new Date().toISOString(); save(state);
    console.log(JSON.stringify({ status: 'UPDATE_OK', release: state.code, backup: backup.backupPath, localHttp: 'ok', localHttpsAssets: state.httpsAssets, publicDns: 'not-verified' }));
  } catch (error) {
    state.failure = error.message; save(state);
    if (stopped) {
      try { restoreCode(state); await healthy(false); console.error('PREVIOUS_CODE_RESTORED; database was not restored or overwritten.'); }
      catch { console.error(`AUTOMATIC_ROLLBACK_FAILED; use the reviewed --rollback command. State: ${STATE}`); }
    }
    throw error;
  }
}
async function main() {
  check(process.platform === 'linux' && process.getuid() === 0, 'VPS root only');
  const mode = process.argv[2];
  check((process.argv.length === 3 && ['--prepare', '--apply-approved-production', '--rollback', '--status'].includes(mode)) || (process.argv.length === 4 && mode === '--prepare-git'), 'Explicit operation required');
  if (mode === '--status') {
    const state = json(STATE); console.log(JSON.stringify({ phase: state.phase, release: state.code, backup: state.backup?.backupPath, failure: state.failure })); return;
  }
  check(process.env.BLABLA_RELEASE_LOCKED === '1', 'Use deploy/release.sh so the operation runs under systemd and flock');
  if (mode === '--prepare') await prepare();
  if (mode === '--prepare-git') await prepare(buildGit(process.argv[3]));
  if (mode === '--apply-approved-production') await apply();
  if (mode === '--rollback') {
    const state = json(STATE);
    check(state.phase !== 'prepared', 'Production has not been switched; nothing to roll back');
    restoreCode(state); await healthy(false); console.log('PREVIOUS_CODE_RESTORED');
  }
}
module.exports = { safeEnvironment, processConfig, appendStatic, restoreCode, memoryForBuild };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
