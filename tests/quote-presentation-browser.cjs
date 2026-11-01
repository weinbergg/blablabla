/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), { randomUUID } = require('node:crypto');
const Database = require('better-sqlite3');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.BLABLA_TEST_BASE_URL || 'http://127.0.0.1:3103';
if (new URL(base).hostname !== '127.0.0.1' || !process.env.BLABLA_TEST_FIXTURES) throw Error('Local disposable fixtures required');
const f = JSON.parse(fs.readFileSync(process.env.BLABLA_TEST_FIXTURES)), out = path.dirname(process.env.BLABLA_TEST_FIXTURES);
if (!path.basename(out).startsWith('blabla-browser-') || path.resolve(f.databasePath) !== path.join(path.resolve(out), 'test.db')) throw Error('Disposable DB only');
(async () => {
  const db = new Database(f.databasePath), noteIds = [];
  const row = db.prepare("SELECT json_extract(j.value,'$.anchor') AS anchor FROM channel_posts p,json_each(p.content_json,'$.blocks') j WHERE p.channel_id=? AND json_extract(j.value,'$.type')='quote' AND json_extract(j.value,'$.anchor.documentId')=? LIMIT 1").get(f.channel.id, f.txt.id);
  if (!row) throw Error('Run anchors-browser first');
  const anchor = JSON.parse(row.anchor), href = `/documents/${anchor.documentId}?page=${anchor.page}#quote=${encodeURIComponent(JSON.stringify(anchor))}`;
  for (const [author, visibility, body, value] of [
    ['a', 'public', 'Публичная мысль о точном фрагменте.', anchor],
    ['a', 'private', 'Моя личная запись к фрагменту.', anchor],
    ['b', 'private', 'Чужая приватная запись не должна появиться.', anchor],
    ['a', 'public', 'Другая позиция с теми же словами.', { ...anchor, page: anchor.page + 1 }],
  ]) {
    const id = randomUUID(); noteIds.push(id);
    db.prepare("INSERT INTO annotations(id,document_id,author_id,page,x,y,shape,color,body,visibility,allow_discussion,text_anchor) VALUES(?,?,?,?,0.1,0.1,'pin','amber',?,?,1,?)").run(id, anchor.documentId, f.users[author].id, value.page, body, visibility, JSON.stringify(value));
  }
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
    await context.addCookies([{ name: 'blabla_session', value: f.users.a.token, domain: '127.0.0.1', path: '/' }]);
    const p = await context.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message)); p.setDefaultTimeout(30000);
    const post = await context.request.post(`${base}/api/channels/${f.channel.id}/posts`, { data: { title: 'Книга и мысль на полях', published: true, content: { version: 1, blocks: [
      { id: 'intro', type: 'text', doc: { type: 'doc', content: [{ type: 'paragraph', content: [
        { type: 'text', text: 'Сегодня читаем ' }, { type: 'text', text: base + href, marks: [{ type: 'link', attrs: { href: base + href } }] },
        { type: 'text', text: '. К этому фрагменту хочется возвращаться. ' },
        { type: 'text', text: 'Внешний источник', marks: [{ type: 'link', attrs: { href: 'https://example.invalid/documents/external-book' } }] },
      ] }] } },
      { id: 'book', type: 'book', documentId: f.epub.id },
      { id: 'quote', type: 'quote', anchor, comment: 'Здесь чтение становится разговором.' },
      { id: 'long', type: 'quote', anchor: { ...anchor, exact: (anchor.exact + '\n').repeat(24) }, comment: '' },
    ] } } });
    assert.equal(post.status(), 201, await post.text()); const saved = await post.json();
    const url = `${base}/channels/${f.channel.slug}/${saved.slug}`;
    await p.goto(url); const inline = p.locator('[data-book-link]').first();
    await inline.locator('a').filter({ hasText: f.txt.title }).waitFor();
    assert.equal(await inline.locator('a').getAttribute('href'), href);
    assert(!(await inline.innerText()).includes('/documents/'));
    assert.equal(await p.locator('a[href="https://example.invalid/documents/external-book"]').count(), 1);
    assert.equal(await p.locator('[data-book-link="external-book"]').count(), 0);
    await inline.locator('a').hover(); await p.getByRole('tooltip').waitFor();
    await p.screenshot({ path: path.join(out, 'book-hover-1440.png') });
    await p.mouse.move(0, 0);
    await inline.getByRole('button', { name: /О книге/ }).click();
    await p.getByRole('dialog', { name: 'О книге' }).getByRole('link', { name: 'Открыть книгу' }).waitFor();
    await p.keyboard.press('Escape');
    assert(await inline.getByRole('button').evaluate(el => el === document.activeElement), 'dialog should return focus');
    const quote = p.locator('[data-quote-block="quote"]'), long = p.locator('[data-quote-block="long"]');
    await long.getByRole('button', { name: 'Читать цитату целиком' }).click();
    assert.equal(await long.locator('blockquote').textContent(), (anchor.exact + '\n').repeat(24));
    await long.getByRole('button', { name: 'Свернуть цитату' }).click();
    await quote.getByRole('button', { name: 'Скопировать цитату', exact: true }).click();
    const clipboard = await p.evaluate(() => navigator.clipboard.readText());
    assert(clipboard.includes(anchor.exact)); assert(clipboard.endsWith(base + href));
    await quote.getByRole('button', { name: 'Пометки к фрагменту' }).click();
    const notes = quote.getByLabel('Доступные пометки к цитате'); await notes.getByText('Моя личная запись к фрагменту.').waitFor();
    assert((await notes.innerText()).includes('Публичная мысль')); assert(!(await notes.innerText()).includes('Чужая приватная')); assert(!(await notes.innerText()).includes('Другая позиция'));
    await quote.getByRole('button', { name: 'Пометки к фрагменту' }).click();
    await quote.getByRole('button', { name: 'Обсудить цитату' }).click();
    assert((await p.getByLabel('Комментарий к публикации').inputValue()).includes(anchor.exact));
    await p.getByLabel('Комментарий к публикации').fill('Своя мысль уже написана.');
    await quote.getByRole('button', { name: 'Обсудить цитату' }).click();
    assert.equal(await p.getByLabel('Комментарий к публикации').inputValue(), 'Своя мысль уже написана.');
    await p.goto(url); await p.evaluate(() => document.fonts.ready);
    for (const width of [1440, 1024, 768, 390, 320]) {
      await p.setViewportSize({ width, height: 1000 }); await p.bringToFront(); await p.evaluate(() => { document.activeElement?.blur(); scrollTo({ top: 0, behavior: 'instant' }); }); await p.waitForTimeout(350);
      assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.equal(await p.locator('header').count(), 1);
      assert.equal(Math.round((await p.locator('header').boundingBox()).y), 0, 'header must stay at viewport top');
      await p.screenshot({ path: path.join(out, `interactive-quotes-viewport-${width}.png`) });
      await p.screenshot({ path: path.join(out, `interactive-quotes-${width}.png`), fullPage: true });
      if (width === 390 || width === 320) {
        await inline.getByRole('button').click(); const modal = p.getByRole('dialog', { name: 'О книге' });
        assert(await modal.evaluate(el => el.getBoundingClientRect().right <= innerWidth));
        await p.screenshot({ path: path.join(out, `book-preview-${width}.png`) });
        await modal.getByRole('button', { name: 'Закрыть сведения о книге' }).click();
      }
    }
    await p.emulateMedia({ reducedMotion: 'reduce' });
    await quote.getByRole('button', { name: 'В свой канал' }).click();
    await quote.getByLabel('Комментарий к цитате').fill('Продолжаю эту мысль у себя.');
    await quote.getByRole('button', { name: /На полях прочитанного/ }).click();
    await p.waitForURL(u => u.pathname.endsWith('/write'));
    await p.getByLabel('Заголовок публикации').fill('Цитата с сохранённым источником');
    await p.getByRole('button', { name: 'Опубликовать', exact: true }).click(); await p.waitForURL(u => !u.pathname.endsWith('/write'));
    const shared = db.prepare("SELECT content_json FROM channel_posts WHERE channel_id=? AND slug=?").get(f.channel.id, new URL(p.url()).pathname.split('/').pop());
    assert.deepEqual(JSON.parse(shared.content_json).blocks.find(b => b.type === 'quote').anchor, anchor);
    await p.goto(base + '/channels/' + f.channel.slug + '/write');
    const editor = p.getByRole('textbox', { name: 'Текст публикации', exact: true }).first();
    await editor.fill('Ссылка на книгу: '); await editor.press('End');
    await p.evaluate(value => navigator.clipboard.writeText(value), base + '/documents/' + f.epub.id);
    await editor.press('Meta+V'); await p.getByRole('button', { name: 'Предпросмотр' }).click();
    const preview = p.getByRole('dialog').filter({ hasText: 'Предпросмотр публикации' });
    await preview.locator('[data-book-link]').getByText(f.epub.title, { exact: true }).waitFor();
    await preview.getByRole('button', { name: 'Закрыть предпросмотр' }).click();
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'quote-presentation-results.json'), JSON.stringify({ ok: true, postUrl: url, checks: ['same origin only', 'hover and keyboard preview', 'mobile book dialog', 'exact anchor retained', 'long quote expand', 'copy full quote', 'private notes filtered', 'existing comment draft retained', 'share through existing editor retains version', 'native paste becomes book title', 'five viewport widths and reduced motion'] }));
    console.log('Interactive books and quotes passed');
  } finally { for (const id of noteIds) db.prepare('DELETE FROM annotations WHERE id=?').run(id); db.close(); await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
