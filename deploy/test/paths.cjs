/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
function testRoot(input, initialized = true) {
  const root = fs.realpathSync(input);
  if (root === '/var/www/blabla' || root.startsWith('/var/www/blabla/')) throw Error('Production tree is forbidden');
  const local = root.startsWith(fs.realpathSync(os.tmpdir()) + path.sep) || root.includes('/data/implementation-checks/');
  if (root !== '/srv/blabla-test/app' && !(local && /^blabla-test-[\w-]+$/.test(path.basename(root)))) throw Error('Only /srv/blabla-test/app or an isolated blabla-test-* scratch directory is allowed');
  if (path.resolve(input) !== root) throw Error('Test root must not be a symlink');
  for (const name of fs.readdirSync(root)) if ((name === '.env' || name.startsWith('.env.')) && name !== '.env.example') throw Error('Do not copy environment files into the test application');
  const db = path.join(root, 'data/app.db');
  if (process.env.DATABASE_PATH && path.resolve(process.env.DATABASE_PATH) !== db) throw Error('Foreign DATABASE_PATH refused');
  for (const dir of ['data', 'public', 'public/uploads', 'data/community-uploads', 'data/music-uploads', 'data/tmp-uploads', 'data/logs']) {
    const file = path.join(root, dir);
    if (fs.existsSync(file) && fs.realpathSync(file) !== file) throw Error('Test storage must not be symlinked');
  }
  if (initialized) {
    const marker = JSON.parse(fs.readFileSync(path.join(root, 'data/test-instance.json')));
    if (marker.kind !== 'blabla-isolated-test' || !marker.instanceId) throw Error('Missing test instance marker');
    if (fs.realpathSync(db) !== db || fs.statSync(db).nlink !== 1) throw Error('Database must be a private, independent file');
    for (const book of marker.books) {
      if (!/^[\w-]+\.(pdf|epub|txt)$/.test(book.file)) throw Error('Invalid book path');
      const file = path.join(root, 'public/uploads', book.file);
      if (fs.realpathSync(file) !== file || !fs.statSync(file).isFile() || fs.statSync(file).nlink !== 1) throw Error('Books must be independent files');
    }
  }
  return root;
}
module.exports = { testRoot };
