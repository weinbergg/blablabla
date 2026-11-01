/* eslint-disable @typescript-eslint/no-require-imports */
const path = require('node:path');
const { testRoot } = require('./paths.cjs');

function environment(input) {
  const root = testRoot(input);
  // Never inherit SMTP, YooKassa, cron, NODE_OPTIONS or a production DATABASE_PATH.
  return {
    PATH: path.dirname(process.execPath) + ':/usr/bin:/bin',
    HOME: root, TMPDIR: path.join(root, 'data/tmp-uploads'),
    NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1',
    DATABASE_PATH: path.join(root, 'data/app.db'), FILE_SERVE_MODE: 'stream',
    PUBLIC_URL: 'http://127.0.0.1:3301',
  };
}
module.exports = { environment };
if (require.main === module) {
  const root = testRoot(process.cwd());
  const env = environment(root);
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, env);
  process.argv = [process.execPath, path.join(root, 'node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', '3001'];
  require(process.argv[1]);
}
