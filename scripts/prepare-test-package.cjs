/* eslint-disable @typescript-eslint/no-require-imports */
// Local-only source bundle. Reads just three document records and their published anchors.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const Database = require('better-sqlite3');
const os = require('node:os');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const root = path.resolve(__dirname, '..');
const fixtureDir = path.resolve(process.argv[2] || path.join(root, 'data/implementation-checks/blabla-browser-4PdIbr'));
if (!fixtureDir.startsWith(path.join(root, 'data/implementation-checks') + path.sep)) throw Error('Use local regression fixtures only');
const out = fs.mkdtempSync(path.join(root, 'data/implementation-checks/test-package-'));
fs.chmodSync(out, 0o700);
// Keep copied TypeScript outside the checkout (tsc includes **/*.ts).
const source = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'blabla-test-package-')), booksDir = path.join(source, 'test-books');
fs.mkdirSync(booksDir, { recursive: true });
const fixture = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'fixtures.json'), 'utf8'));
const db = new Database(path.join(fixtureDir, 'test.db'), { readonly: true, fileMustExist: true });
const books = [];
try {
  for (const format of ['PDF', 'EPUB', 'TXT']) {
    const id = fixture[format.toLowerCase()].id;
    const book = db.prepare('SELECT id,title,file_url,language FROM documents WHERE id=?').get(id);
    if (!book || !/^\/uploads\/[\w-]+\.(pdf|epub|txt)$/.test(book.file_url)) throw Error('Invalid selected book');
    const authors = db.prepare('SELECT a.name FROM authors a JOIN document_authors da ON da.author_id=a.id WHERE da.document_id=? ORDER BY a.name').all(id).map(a => a.name).join(', ');
    const posts = db.prepare('SELECT content_json FROM channel_posts WHERE channel_id=? AND title=? AND published=1 AND deleted_at IS NULL').all(fixture.channel.id, `Заметка на полях — ${format}`);
    const anchor = posts.flatMap(p => JSON.parse(p.content_json).blocks).find(b => b.type === 'quote' && b.anchor.documentId === id)?.anchor;
    const file = `book.${format.toLowerCase()}`, input = path.join(root, 'public', book.file_url);
    if (!fs.lstatSync(input).isFile()) throw Error('Book must be a regular file');
    const bytes = fs.readFileSync(input), hash = sha(bytes);
    if (!anchor || anchor.textVersion !== `sha256:${hash}`) throw Error('Missing verified native-selection anchor');
    fs.writeFileSync(path.join(booksDir, file), bytes, { flag: 'wx' });
    books.push({ id, title: book.title, format, language: book.language, authors, file, sha256: hash, anchor });
  }
} finally { db.close(); }
fs.writeFileSync(path.join(booksDir, 'books.json'), JSON.stringify(books, null, 2));
const git = fs.existsSync('/Library/Developer/CommandLineTools/usr/bin/git') ? '/Library/Developer/CommandLineTools/usr/bin/git' : 'git';
const files = execFileSync(git, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root }).toString().split('\0').filter(Boolean);
const roots = new Set(['package.json', 'package-lock.json', 'tsconfig.json', 'next-env.d.ts', 'next.config.ts', 'postcss.config.mjs', 'eslint.config.mjs', 'middleware.ts']);
const manifest = [];
for (const file of [...new Set(files)].sort()) {
  if (!roots.has(file) && !/^(app|components|lib|scripts|deploy|tests|types|public)\//.test(file)) continue;
  if (/^(public\/uploads|data|node_modules)\//.test(file) || /(?:^|\/)(?:\.env(?:\.|$)|\.git|\.DS_Store)|\.(?:db|sqlite|log|pem|key)$/.test(file)) continue;
  if (!fs.existsSync(path.join(root, file))) continue; // staged removals
  if (!fs.lstatSync(path.join(root, file)).isFile()) throw Error(`Non-regular source: ${file}`);
  const bytes = fs.readFileSync(path.join(root, file));
  fs.mkdirSync(path.dirname(path.join(source, file)), { recursive: true });
  fs.writeFileSync(path.join(source, file), bytes);
  manifest.push({ file, bytes: bytes.length, sha256: sha(bytes) });
}
fs.writeFileSync(path.join(source, 'source-manifest.json'), JSON.stringify({ gitHead: execFileSync(git, ['rev-parse', 'HEAD'], { cwd: root }).toString().trim(), dirtySnapshot: true, files: manifest, books }, null, 2));
fs.copyFileSync(path.join(source, 'source-manifest.json'), path.join(out, 'source-manifest.json'));
execFileSync('tar', ['-czf', path.join(out, 'test-source.tar.gz'), '-C', source, '.']);
console.log(JSON.stringify({ source, archive: path.join(out, 'test-source.tar.gz'), files: manifest.length, bookBytes: books.reduce((n,b) => n + fs.statSync(path.join(booksDir,b.file)).size, 0), containsDatabaseOrCredentials: false }, null, 2));
