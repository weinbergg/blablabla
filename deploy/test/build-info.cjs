/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs'), crypto = require('node:crypto');
const Database = require('better-sqlite3');
if (process.platform !== 'linux' || process.arch !== 'x64' || process.version !== 'v20.20.2') throw Error('Expected Linux x64 / Node 20.20.2 builder');
const db = new Database(':memory:');
const sqlite = db.prepare('SELECT sqlite_version() version').get().version; db.close();
fs.writeFileSync('build-info.json', JSON.stringify({
  platform: process.platform, arch: process.arch, node: process.version,
  glibc: process.report.getReport().header.glibcVersionRuntime, sqlite,
  next: require('next/package.json').version,
  sourceManifestSha256: crypto.createHash('sha256').update(fs.readFileSync('source-manifest.json')).digest('hex'),
  builtAt: new Date().toISOString(), productionDataIncluded: false,
}, null, 2));
