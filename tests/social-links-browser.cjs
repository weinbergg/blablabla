/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), Database = require('better-sqlite3');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
if (!process.env.BLABLA_TEST_FIXTURES) throw Error('Set BLABLA_TEST_FIXTURES');
const fixturePath = process.env.BLABLA_TEST_FIXTURES, f = JSON.parse(fs.readFileSync(fixturePath, 'utf8')), out = path.dirname(fixturePath);
if (!path.basename(out).startsWith('blabla-browser-') || path.resolve(f.databasePath) !== path.join(path.resolve(out), 'test.db')) throw Error('Disposable browser copy required');
const base = process.env.BLABLA_TEST_BASE_URL || 'http://127.0.0.1:3100'; if (new URL(base).hostname !== '127.0.0.1') throw Error('Local only');
async function selectText(p) {
  const target = p.locator('[data-txt-page="1"] pre'); await target.waitFor();
  return target.evaluate(el => { const node = el.firstChild, range = document.createRange(); const start = node.textContent.search(/\S/); range.setStart(node, start); range.setEnd(node, Math.min(start + 100, node.textContent.length)); const s = getSelection(); s.removeAllRanges(); s.addRange(range); return s.toString().trim(); });
}
(async () => {
  const db = new Database(f.databasePath), browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, headless: true });
  try {
    const a = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), b = await browser.newContext();
    for (const [ctx, u] of [[a, f.users.a], [b, f.users.b]]) await ctx.addCookies([{ name: 'blabla_session', value: u.token, domain: '127.0.0.1', path: '/' }]);
    const p = await a.newPage(), q = await b.newPage(), errors = [];
    for (const page of [p, q]) { page.setDefaultTimeout(30000); page.on('pageerror', e => errors.push(e.message)); }
    await p.route('**/api/lookup?**', r => r.fulfill({ json: { lemma: '', definitions: [], parses: [], glossaryHits: [] } }));
    const created = await a.request.post(base + '/api/channels/' + f.channel.id + '/posts', { data: { title: 'Разговор вокруг книги', body: 'Публикация для проверки модерации содержательного разговора.' } }); assert(created.ok()); const post = await created.json();
    const url = base + '/channels/' + f.channel.slug + '/' + post.slug;
    await q.goto(url); await q.getByLabel('Действия с публикацией').click(); await q.getByRole('button', { name: 'Пожаловаться', exact: true }).click();
    await q.getByRole('dialog').getByRole('combobox').selectOption('Не по теме / мусор'); await q.getByRole('dialog').getByRole('button', { name: 'Отправить', exact: true }).click(); await q.getByRole('heading', { name: 'Жалоба отправлена' }).waitFor();
    assert(db.prepare('SELECT id FROM feedback WHERE author_id=? AND body LIKE ?').get(f.users.b.id, '%' + post.slug + '%'));
    assert((await a.request.post(base + '/api/channels/' + f.channel.id + '/moderators', { data: { userId: f.users.b.id, role: 'moderator' } })).ok());
    await q.goto(url); await q.getByLabel('Действия с публикацией').click(); assert.equal(await q.getByRole('link', { name: 'Редактировать', exact: true }).count(), 0); await q.getByRole('button', { name: 'Закрыть обсуждение', exact: true }).click(); await q.getByText('Обсуждение закрыто редакцией.', { exact: true }).waitFor();
    assert.equal((await b.request.post(base + '/api/channels/' + f.channel.id + '/comments', { data: { postId: post.id, body: 'Закрытый разговор' } })).status(), 400);
    if (!(await q.locator('details').getAttribute('open') !== null)) await q.getByLabel('Действия с публикацией').click(); await q.getByRole('button', { name: 'Открыть обсуждение', exact: true }).click(); await q.getByLabel('Комментарий к публикации').waitFor();
    await p.goto(base + '/documents/' + f.txt.id + '?page=1'); const exact = await selectText(p); await p.getByRole('button', { name: 'Обсудить книгу', exact: true }).click(); await p.waitForURL(u => u.pathname === '/discuss/new');
    await p.locator('blockquote').filter({ hasText: exact }).waitFor(); await p.getByLabel('Название темы', { exact: true }).fill('Обсудим точный фрагмент книги'); await p.getByLabel('Начало разговора', { exact: true }).fill('Как вы понимаете этот фрагмент? Предлагаю прочитать его вместе.'); await p.reload(); await p.locator('blockquote').filter({ hasText: exact }).waitFor();
    await p.getByRole('button', { name: 'Открыть тему', exact: true }).click(); await p.waitForURL(u => u.pathname.startsWith('/discuss/') && !u.pathname.endsWith('/new')); const topicUrl = p.url();
    await p.locator('a[href*="#quote="]').first().click(); await p.locator('[data-anchor-status]').filter({ hasText: 'Цитата найдена в тексте.' }).waitFor(); await p.goBack(); assert.equal(p.url(), topicUrl);
    await p.getByRole('link', { name: 'Открыть совместное чтение →', exact: true }).click(); await p.getByText(f.txt.title, { exact: true }).waitFor(); await p.getByLabel('Название комнаты').fill('Продолжение разговора о фрагменте'); await p.getByRole('button', { name: 'Открыть комнату', exact: true }).click(); await p.waitForURL(u => !u.pathname.endsWith('/new')); await p.getByRole('link', { name: 'Войти в комнату', exact: true }).click();
    await selectText(p); await p.getByRole('button', { name: 'Обсудить в комнате', exact: true }).click(); await p.getByLabel('Сообщение в комнату').fill('Этот фрагмент задаёт направление нашему чтению.'); await p.reload(); await p.getByRole('button', { name: 'Убрать цитату', exact: true }).waitFor(); assert.equal(await p.getByLabel('Сообщение в комнату').inputValue(), 'Этот фрагмент задаёт направление нашему чтению.');
    await p.getByRole('button', { name: 'Отправить сообщение', exact: true }).click(); const source = p.locator('aside a[href*="#quote="]').first(); await source.waitFor(); const roomUrl = p.url(); await source.click(); await p.locator('[data-anchor-status]').filter({ hasText: 'Цитата найдена в тексте.' }).waitFor(); assert.equal(p.url(), roomUrl, 'Quote opens inside the shared reader');
    const roomPath = new URL(roomUrl).pathname.replace(/\/read$/, '');
    const announcement = await a.request.post(base + '/api/channels/' + f.channel.id + '/posts', { data: { title: 'Приглашение к чтению', content: { version: 1, blocks: [{ id: 'room', type: 'link', href: roomPath, label: 'Читаем вместе', description: '' }, { id: 'book', type: 'book', documentId: f.epub.id }] } } }); assert(announcement.ok()); const eventPost = await announcement.json();
    await p.goto(base + '/channels/' + f.channel.slug + '/' + eventPost.slug); await p.getByText('Программа и участие', { exact: true }).waitFor();
    const coverResponse = await a.request.get(base + '/api/documents/' + f.epub.id + '/cover'); assert([200, 204].includes(coverResponse.status()));
    if (coverResponse.status() === 200) { const cover = p.locator('img[src*="/cover"]'); await cover.scrollIntoViewIfNeeded(); await p.waitForFunction(() => [...document.images].some(i => i.src.includes('/cover') && i.naturalWidth > 0)); }
    const room = db.prepare('SELECT id FROM seminars WHERE slug=?').get(roomPath.split('/').pop()); db.prepare("UPDATE seminars SET access_mode='closed' WHERE id=?").run(room.id);
    await p.reload(); assert.equal(await p.getByText('Программа и участие', { exact: true }).count(), 0, 'A private room no longer has a public event preview');
    db.prepare("UPDATE seminars SET access_mode='open' WHERE id=?").run(room.id);
    assert.deepEqual(errors, []); fs.writeFileSync(path.join(out, 'social-links-results.json'), JSON.stringify({ ok: true, checks: ['report stored in feedback', 'moderator closes comments without editor rights', 'reader quote to forum with restored draft', 'exact return and back', 'discussion to shared reading', 'room quote draft restore', 'in-room anchor navigation'] })); console.log('Social links browser checks passed');
  } finally { db.close(); await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
