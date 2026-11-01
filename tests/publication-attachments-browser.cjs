/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), { randomUUID } = require('node:crypto');
const Database = require('better-sqlite3');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.BLABLA_TEST_BASE_URL || 'http://127.0.0.1:3102';
if (new URL(base).hostname !== '127.0.0.1' || !process.env.BLABLA_TEST_FIXTURES) throw Error('Isolated local fixtures required');
const f = JSON.parse(fs.readFileSync(process.env.BLABLA_TEST_FIXTURES)), out = path.dirname(process.env.BLABLA_TEST_FIXTURES);
if (!path.basename(out).startsWith('blabla-browser-') || path.resolve(f.databasePath) !== path.join(path.resolve(out), 'test.db')) throw Error('Disposable DB only');
(async () => {
  const db = new Database(f.databasePath), id = randomUUID();
  const saved = db.prepare("SELECT json_extract(j.value,'$.anchor') AS text_anchor FROM channel_posts p, json_each(p.content_json,'$.blocks') j WHERE p.author_id=? AND json_extract(j.value,'$.type')='quote' AND json_extract(j.value,'$.anchor.documentId')=? LIMIT 1").get(f.users.a.id, f.txt.id);
  assert(saved, 'Run anchors-browser first to publish an actual selected quote');
  db.prepare("INSERT INTO annotations(id,document_id,author_id,page,x,y,body,visibility,text_anchor,created_at) VALUES(?,?,?,?,10,10,?,'private',?,?)").run(id, f.txt.id, f.users.a.id, JSON.parse(saved.text_anchor).page, 'Личный комментарий — переносить только с моего согласия.', saved.text_anchor, new Date().toISOString());
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await context.addCookies([{ name: 'blabla_session', value: f.users.a.token, domain: '127.0.0.1', path: '/' }]);
    const p = await context.newPage(), errors = []; p.on('pageerror', e => errors.push(e.message));
    await p.goto(base + '/channels/' + f.channel.slug + '/write'); await p.locator('.tiptap').waitFor();
    await p.getByLabel('Заголовок публикации').fill('Книга, фрагмент и материалы встречи'); await p.locator('.tiptap').fill('Вернёмся к источнику и сравним наши заметки.');
    await p.getByRole('button', { name: 'Книга', exact: true }).click(); await p.getByLabel('Найти книгу').fill('Vasari');
    const book = p.getByRole('dialog').locator(`button:has(img[src="/api/documents/${f.epub.id}/cover"])`); await book.waitFor(); await book.click();
    await p.getByRole('button', { name: 'С пометкой', exact: true }).click();
    await p.getByRole('dialog').locator('button:has(img)').first().click();
    const consent = p.getByLabel('Добавить мой комментарий в публикацию'); assert.equal(await consent.isChecked(), false);
    await p.getByRole('dialog').getByText('Личный комментарий — переносить только с моего согласия.', { exact: true }).waitFor();
    await p.screenshot({ path: path.join(out, 'quote-consent-390.png') });
    await consent.check(); await p.getByRole('button', { name: 'Вставить выбранный фрагмент', exact: true }).click();
    await p.getByRole('button', { name: 'Файл', exact: true }).click();
    await p.getByRole('dialog').locator('input[type=file]').setInputFiles({ name: 'Материалы встречи.txt', mimeType: 'text/plain', buffer: Buffer.from('Материалы для чтения и обсуждения.\n') });
    await p.getByRole('button', { name: 'Добавить в публикацию (1)', exact: true }).click();
    await p.getByRole('button', { name: 'Опубликовать', exact: true }).click(); await p.waitForURL(u => !u.pathname.endsWith('/write'));
    const postUrl = p.url(); await p.reload();
    assert.equal(await p.locator(`a[href="/documents/${f.epub.id}"]:has(img)`).count(), 1);
    await p.getByText('Личный комментарий — переносить только с моего согласия.', { exact: true }).waitFor();
    const file = p.locator('a[download]').filter({ hasText: 'Материалы встречи.txt' }); assert((await file.innerText()).includes('КБ'));
    const download = await context.request.get(base + await file.getAttribute('href')); assert.equal(download.status(), 200); assert.match(download.headers()['content-disposition'], /^attachment;/);
    assert.equal(db.prepare('SELECT visibility FROM annotations WHERE id=?').get(id).visibility, 'private');
    const sourceHref = await p.locator('a[href*="#quote="]').first().getAttribute('href'); assert.equal(JSON.parse(decodeURIComponent(sourceHref.split('#quote=')[1])).exact, JSON.parse(saved.text_anchor).exact);
    for (const width of [1440, 768, 430, 390, 375, 320]) {
      await p.bringToFront(); await p.setViewportSize({ width, height: 900 }); await p.evaluate(() => scrollTo(0,0)); await p.waitForTimeout(350); assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await p.screenshot({ path: path.join(out, `publication-sources-${width}.png`), fullPage: true });
    }
    await p.goto(base + '/channels/' + f.channel.slug + '?tab=media');
    await p.getByRole('navigation', { name: 'Тип материала' }).getByRole('link', { name: 'Книги', exact: true }).click();
    const origin = p.locator('section[aria-label="Медиатека канала"] a').filter({ hasText: 'Книга, фрагмент и материалы встречи' }).first(); await origin.waitFor(); assert.equal(new URL(await origin.getAttribute('href'), base).href, postUrl);
    for (const width of [1440, 768, 430, 390, 375, 320]) {
      await p.bringToFront(); await p.setViewportSize({ width, height: 900 }); await p.evaluate(() => scrollTo(0,0)); await p.waitForTimeout(350); assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); assert(await p.locator('h1').evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'channel title clipped'); await p.screenshot({ path: path.join(out, `channel-library-${width}.png`), fullPage: true });
    }
    await origin.click(); await p.waitForURL(postUrl);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'publication-attachments-results.json'), JSON.stringify({ ok: true, postUrl, checks: ['book search by author and cover', 'saved private quote explicit comment consent', 'file metadata and authenticated download', 'source retained after reload', 'media library and source post', 'six widths, reduced motion'] }));
    console.log('Publication attachments browser passed');
  } finally { db.prepare('DELETE FROM annotations WHERE id=?').run(id); db.close(); await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
