/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs'), path = require('path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { mouseSelect, visibleLine } = require('./support/reader-gestures.cjs');
const base = process.env.BLABLA_TEST_BASE_URL || 'http://127.0.0.1:3101';
if (new URL(base).hostname !== '127.0.0.1' || !process.env.BLABLA_TEST_FIXTURES) throw Error('Requires local isolated fixtures');
const f = JSON.parse(fs.readFileSync(process.env.BLABLA_TEST_FIXTURES));
const out = path.dirname(process.env.BLABLA_TEST_FIXTURES), results = [];
const normalize = text => text.replace(/\s+/g, ' ').trim();

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined, headless: true });
  const deadline = setTimeout(() => browser.close(), 240000);
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
    await context.addCookies([{ name: 'blabla_session', value: f.users.a.token, domain: '127.0.0.1', path: '/' }]);
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/lookup?**', r => r.fulfill({ json: { definitions: [], parses: [], glossaryHits: [] } }));
    async function reader(format) {
      if (format !== 'epub') return { frame: page, selector: format === 'pdf' ? '.textLayer' : '[data-txt-page] pre' };
      await page.locator('.epub-container iframe').first().waitFor();
      return { frame: await (await page.locator('.epub-container iframe').first().elementHandle()).contentFrame(), selector: 'body' };
    }
    async function closeMenu() {
      const close = page.getByRole('button', { name: 'Скрыть меню выделения' });
      if (await close.count()) await close.click();
    }
    async function select(format, options = {}) {
      const { frame, selector } = await reader(format);
      const selected = await mouseSelect(page, frame, selector, { ...options,
        onHold: async () => assert.equal(await page.locator('[data-reader-selection-ui]').count(), 0, 'menu appeared during native drag') });
      if (!selected.selected.trim()) { console.log('SELECTION FAILURE', format, await page.viewportSize(), selected); await page.screenshot({ path: path.join(out, format + '-gesture-failure.png') }); }
      assert(selected.selected.trim().length > 0, format + ' native input selected text');
      await page.locator('[data-reader-selection-ui]').waitFor();
      assert(normalize(await page.locator('[data-reader-selection-ui]').innerText()).includes(normalize(selected.selected)), format + ' menu retained text');
      return selected;
    }
    for (const format of (process.env.BLABLA_READER_FORMATS?.split(',') || ['txt', 'pdf', 'epub'])) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(base + '/documents/' + f[format].id + '?page=1', { waitUntil: 'networkidle', timeout: 60000 });
      await page.getByRole('button', { name: /Добавить пометку/ }).first().waitFor({ timeout: 60000 });
      const area = page.locator(format === 'epub' ? '.epub-container' : format === 'pdf' ? '.textLayer' : '[data-txt-page="1"]').first();
      await area.scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
      await select(format, { slow: true }); await closeMenu();
      await select(format, { double: true });
      const beforeKey = page.url(); await page.keyboard.press('Shift+ArrowRight'); assert.equal(page.url(), beforeKey, 'keyboard selection turned page');
      await closeMenu();
      const selected = await select(format);
      await page.getByRole('button', { name: 'Копировать текст', exact: true }).click();
      await page.getByText('Текст скопирован', { exact: true }).waitFor();
      assert.equal(normalize(await page.evaluate(() => navigator.clipboard.readText())), normalize(selected.selected));
      await page.getByRole('button', { name: 'Ссылка на фрагмент', exact: true }).click();
      await page.getByRole('button', { name: 'Ссылка скопирована', exact: true }).waitFor();
      const quoteUrl = await page.evaluate(() => navigator.clipboard.readText());
      await page.goto(quoteUrl, { waitUntil: 'networkidle' });
      await page.getByText('Цитата найдена', { exact: false }).waitFor({ timeout: 30000 });
      results.push({ format, test: 'native drag, paused drag, double click, copy and exact quote return', ok: true });

      await page.goto(base + '/documents/' + f[format].id + '?page=2', { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: /Добавить пометку/ }).first().waitFor();
      const second = page.locator(format === 'epub' ? '.epub-container' : format === 'pdf' ? '.textLayer' : '[data-txt-page="2"]').first();
      await second.scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
      await select(format, { slow: true }); await closeMenu();
      await page.getByRole('button', { name: 'Масштаб: увеличить', exact: true }).click();
      await page.waitForTimeout(600); await select(format); await closeMenu();
      await page.getByRole('button', { name: 'Масштаб: сбросить', exact: true }).click();
      await page.waitForTimeout(600);
      results.push({ format, test: 'native selection after zoom and reset', ok: true });
      await page.getByRole('button', { name: 'Развернуть на весь экран' }).click();
      await page.locator('.reader-stage.is-fullscreen').waitFor(); await page.waitForTimeout(600);
      for (const width of [1440, 1024, 768, 430, 390, 320]) {
        await page.setViewportSize({ width, height: 900 }); await page.waitForTimeout(600);
        const geometry = await page.evaluate(() => {
          const stage = document.querySelector('.reader-stage.is-fullscreen');
          const toolbar = stage.querySelector('.reader-toolbar').getBoundingClientRect();
          const header = stage.querySelector('.reader-chrome').getBoundingClientRect();
          const area = stage.querySelector('.epub-container, .textLayer, [data-txt-page]')?.getBoundingClientRect();
          return { width: document.documentElement.scrollWidth, stage: stage.getBoundingClientRect().toJSON(), header: header.toJSON(), toolbar: toolbar.toJSON(), area: area?.toJSON() };
        });
        assert(geometry.width <= width, format + ' page overflow at ' + width);
        assert(geometry.toolbar.bottom <= 901 && geometry.header.top >= -1, format + ' controls outside screen');
        if (format !== 'txt') {
          assert(geometry.area.top >= geometry.header.bottom - 2, format + ' header covers text');
          assert(geometry.area.bottom <= geometry.toolbar.top + 2, format + ' toolbar covers text');
        }
        const before = geometry.area;
        await page.getByRole('button', { name: 'Скрыть инструменты чтения' }).click(); await page.waitForTimeout(150);
        const after = await page.locator(format === 'epub' ? '.epub-container' : format === 'pdf' ? '.textLayer' : '[data-txt-page]').first().boundingBox();
        assert(Math.abs(after.y - before.y) < 2 && Math.abs(after.height - before.height) < 2, 'toolbar toggle moved text');
        await select(format, { double: true });
        const menu = await page.locator('[data-reader-selection-ui]').boundingBox();
        assert(menu.x >= -1 && menu.x + menu.width <= width + 1, 'menu outside narrow screen');
        await page.screenshot({ path: path.join(out, format + '-fullscreen-' + width + '.png') });
        await closeMenu(); await page.getByRole('button', { name: 'Показать инструменты чтения' }).click();
        results.push({ format, width, test: 'fullscreen controls, stable text geometry, native double click', ok: true });
      }
      await page.getByRole('button', { name: 'Свернуть', exact: true }).click();
      await page.locator('.reader-stage.is-fullscreen').waitFor({ state: 'detached' });
      console.log(format + ' gestures and fullscreen OK');
    }
    assert.deepEqual(errors, []);
    // EPUB screen progression must expose real painted text, not hidden DOM content.
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto(base + '/documents/' + f.epub.id + '?page=3', { waitUntil: 'networkidle' });
    await page.locator('.epub-container iframe').waitFor(); await page.locator('.epub-container').scrollIntoViewIfNeeded();
    const screens = [];
    for (let i = 0; i < 5; i++) {
      await page.waitForTimeout(300); const { frame } = await reader('epub');
      const line = await visibleLine(frame, 'body'); assert(line, 'EPUB page has no visible hit-testable text'); screens.push(line.text);
      await page.getByRole('button', { name: 'Следующая страница', exact: true }).locator('span').click();
    }
    assert(new Set(screens).size > 1, 'EPUB did not turn pages');
    const position = await page.evaluate(id => JSON.parse(localStorage.getItem('reader:pos:' + id)), f.epub.id);
    assert(position.epubCfi && position.textVersion, 'no exact position saved');
    await page.reload({ waitUntil: 'networkidle' }); await page.locator('.epub-container iframe').waitFor(); await page.waitForTimeout(600);
    const restored = await page.evaluate(id => JSON.parse(localStorage.getItem('reader:pos:' + id)), f.epub.id);
    assert.equal(restored.epubCfi, position.epubCfi, 'reload lost EPUB screen');
    results.push({ test: 'EPUB five visible screens and checksum-bound CFI resume', ok: true });
    console.log(JSON.stringify(results, null, 2));
  } finally {
    clearTimeout(deadline); fs.writeFileSync(path.join(out, 'reader-gestures-results.json'), JSON.stringify(results, null, 2)); await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
