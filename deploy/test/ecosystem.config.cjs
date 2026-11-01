/* eslint-disable @typescript-eslint/no-require-imports */
const path = require('node:path');
const { testRoot } = require('./paths.cjs');
const root = testRoot(path.resolve(__dirname, '../..'));
const { environment } = require('./runtime.cjs');
const common = {
  cwd: root, instances: 1, exec_mode: 'fork', interpreter: process.execPath,
  env: environment(root), autorestart: false, watch: false,
  kill_timeout: 10000, time: true,
};
module.exports = { apps: [
  { ...common, name: 'blabla-test', script: 'deploy/test/runtime.cjs', node_args: '--max-old-space-size=384', max_memory_restart: '512M', out_file: 'data/logs/app.log', error_file: 'data/logs/app-error.log' },
  { ...common, name: 'blabla-test-gate', script: 'deploy/test/gate.cjs', node_args: '--max-old-space-size=64', max_memory_restart: '96M', out_file: 'data/logs/gate.log', error_file: 'data/logs/gate-error.log' },
] };
