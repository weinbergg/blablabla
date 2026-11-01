/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs'), path = require('path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { visibleLine, mouseSelect } = require('./support/reader-gestures.cjs');
const base = process.env.BLABLA_TEST_BASE_URL || 'http://127.0.0.1:3101';
if (new URL(base).hostname !== '127.0.0.1' || !process.env.BLABLA_TEST_FIXTURES) throw Error('Isolated local fixtures required');
const f = JSON.parse(fs.readFileSync(process.env.BLABLA_TEST_FIXTURES)), out = path.dirname(process.env.BLABLA_TEST_FIXTURES);
const results = [];
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
  const deadline = setTimeout(() => browser.close(), 240000);
  try {
    const context = await browser.newContext({ viewport: { width: 1024, height: 900 } });
    await context.addCookies([{ name: 'blabla_session', value: f.users.a.token, domain: '127.0.0.1', path: '/' }]);
    const p = await context.newPage();
    await p.route('**/api/lookup?**', r => r.fulfill({ json: { definitions: [], parses: [], glossaryHits: [] } }));
    const position = (page = p) => page.evaluate(id => JSON.parse(localStorage.getItem('reader:pos:' + id))?.epubCfi, f.epub.id);
    const frame = async (page = p) => (await page.locator('.epub-container iframe').first().elementHandle()).contentFrame();
    for (const id of (process.env.BLABLA_EPUB_DOCUMENTS || f.epub.id).split(',')) {
      await p.goto(base + '/documents/' + id + '?page=6', { waitUntil: 'networkidle' });
      await p.locator('.epub-container iframe').waitFor(); await p.locator('.epub-container').scrollIntoViewIfNeeded();
      let textScreens = 0, imageScreens = 0;
      for (let i = 0; i < 5; i++) {
        await p.waitForTimeout(400); const doc = await frame();
        const text = await visibleLine(doc, 'body');
        const images = await p.locator('.epub-container iframe').evaluate(el => {
          const viewport = el.closest('.epub-container').getBoundingClientRect(), offset = el.getBoundingClientRect();
          return [...el.contentDocument.querySelectorAll('img')].filter(img => { const r = img.getBoundingClientRect(); return img.complete && img.naturalWidth && r.right + offset.left > viewport.left && r.left + offset.left < viewport.right && r.bottom > 0; }).length;
        });
        if (text) textScreens++; if (images) imageScreens++;
        assert(text || images, 'EPUB screen has neither visible text nor an image: ' + id + ' screen ' + i);
        await p.getByRole('button', { name: 'Следующая страница', exact: true }).locator('span').click();
      }
      await p.getByRole('button', { name: 'Оглавление', exact: true }).click();
      const chapters = p.locator('.reader-stage aside li button'); assert(await chapters.count());
      await chapters.nth(Math.min(7, (await chapters.count()) - 1)).click();
      await p.getByRole('button', { name: 'Назад к чтению', exact: true }).click();
      await p.waitForTimeout(400); assert(await visibleLine(await frame(), 'body'), 'TOC return lost visible content');
      results.push({ test: 'EPUB real structure, five pages, TOC and return', id, textScreens, imageScreens, ok: true });
    }
    await p.goto(base + '/documents/' + f.epub.id + '?page=3', {waitUntil:'networkidle'});
    await p.locator('.epub-container iframe').waitFor(); await p.locator('.epub-container').scrollIntoViewIfNeeded();
    let footnote = null;
    for (let i = 0; i < 40 && !footnote; i++) {
      await p.waitForTimeout(250);
      footnote = await p.locator('.epub-container iframe').evaluate(el => {
        const viewport = el.closest('.epub-container').getBoundingClientRect(), offset = el.getBoundingClientRect();
        for (const link of el.contentDocument.querySelectorAll('a[href*="Footnote"]')) {
          const r = link.getBoundingClientRect(), x = r.left + offset.left + r.width/2, y = r.top + offset.top + r.height/2;
          if(r.width && x>viewport.left+8 && x<viewport.right-8 && y>Math.max(0,viewport.top)+8 && y<Math.min(innerHeight,viewport.bottom)-8) return { x,y,href:link.getAttribute('href') };
        }
        return null;
      });
      if(!footnote) await p.getByRole('button',{name:'Следующая страница',exact:true}).locator('span').click();
    }
    assert(footnote,'No visible Vasari footnote found within 40 screens');
    const beforeNote = await position();
    await p.mouse.click(footnote.x,footnote.y); await p.getByRole('button',{name:'Назад к чтению',exact:true}).waitFor(); await p.waitForTimeout(600);
    assert.notEqual(await position(), beforeNote,'Footnote link did not navigate');
    assert(await visibleLine(await frame(),'body'),'Footnote page is blank');
    await p.getByRole('button',{name:'Назад к чтению',exact:true}).click(); await p.waitForTimeout(500);
    assert.equal(await position(), beforeNote,'Footnote return lost original screen');
    results.push({test:'native click on EPUB footnote and exact return',href:footnote.href,ok:true});
    // Native Fullscreen API is exercised in reader-gestures-browser; force the
    // existing CSS fallback here to cover browsers where requestFullscreen fails.
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await mobile.addCookies([{ name: 'blabla_session', value: f.users.a.token, domain: '127.0.0.1', path: '/' }]);
    await mobile.addInitScript(() => { Element.prototype.requestFullscreen = () => Promise.reject(new Error('Test denied fullscreen')); });
    const m = await mobile.newPage();
    await m.goto(base + '/documents/' + f.epub.id + '?page=6', { waitUntil: 'networkidle' });
    await m.locator('.epub-container iframe').waitFor(); await m.getByRole('button', { name: 'Развернуть на весь экран' }).tap();
    await m.waitForTimeout(500); assert.equal(await m.evaluate(() => document.fullscreenElement), null);
    const input = await mobile.newCDPSession(m);
    async function touch({ dx = 0, dy = 0, hold = 0 } = {}) {
      const box = await m.locator('.epub-container').boundingBox(), x = box.x + box.width * .75, y = box.y + box.height * .5;
      await input.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      if (hold) await m.waitForTimeout(hold);
      for (let i = 1; i <= 6; i++) await input.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * i / 6, y: y + dy * i / 6 }] });
      await input.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await m.waitForTimeout(500);
    }
    const first = await position(m); await touch({ dx: -180 }); const second = await position(m);
    assert.notEqual(second, first, 'horizontal swipe failed');
    await touch({ dx: 180 }); assert.equal(await position(m), first, 'reverse swipe failed');
    await touch({ dy: -150 }); assert.equal(await position(m), first, 'vertical gesture turned EPUB page');
    await touch({ hold: 650 }); assert.equal(await position(m), first, 'long press turned page');
    const longPressSelection = await (await frame(m)).evaluate(() => getSelection()?.toString() || '');
    // A mouse-created native selection must also block subsequent swipe navigation.
    const close = m.getByRole('button', { name: 'Скрыть меню выделения' }); if (await close.count()) await close.tap();
    await mouseSelect(m, await frame(m), 'body', { double: true }); await m.waitForTimeout(220);
    const selectedPosition = await position(m); await touch({ dx: -180 }); assert.equal(await position(m), selectedPosition, 'swipe moved a selected passage');
    await m.screenshot({ path: path.join(out, 'epub-touch-fallback.png') });
    results.push({ test: 'native Chromium touch swipe/reverse, vertical and long press guards, selection guard, CSS fullscreen fallback', ok: true, longPressSelectedCharacters: longPressSelection.length, limitation: 'Emulated touch; physical selection handles, iOS Safari and Android devices not tested' });
    await input.detach();
    await m.getByRole('button', { name: 'Свернуть', exact: true }).tap();
    assert.equal(await m.evaluate(() => document.body.style.overflow), '', 'fullscreen left body scroll locked');
    // Repeated SPA routes and browser back/forward, compared with a fresh load.
    for (const width of [1440, 390]) {
      await p.setViewportSize({ width, height: 900 });
      const routes = ['/news', '/channels', '/discuss', '/seminars'], baseline = {};
      const geometry = () => p.evaluate(() => {
        const header = document.querySelector('header')?.getBoundingClientRect(), main = document.querySelector('main')?.getBoundingClientRect();
        return { scrollY, headerBottom: header?.bottom, mainTop: main?.top, gap: main && header ? main.top - header.bottom : null, locked: document.body.style.overflow };
      });
      for (const route of routes) { await p.goto(base + route, { waitUntil: 'networkidle' }); baseline[route] = await geometry(); }
      for (let loop = 0; loop < 3; loop++) for (const route of routes) {
        if (width < 640) await p.getByRole('button', { name: 'Открыть меню', exact: true }).click();
        await p.locator(`header a[href="${route}"]:visible`).first().click(); await p.waitForURL(base + route); await p.waitForTimeout(350);
        const actual = await geometry();
        assert.equal(actual.locked, ''); assert(actual.gap !== null);
        assert(Math.abs(actual.gap - baseline[route].gap) < 3, 'SPA header gap changed: ' + route + ' ' + JSON.stringify(actual));
        results.push({ test: 'SPA layout', width, route, loop, ...actual, ok: true });
      }
      await p.goBack({ waitUntil: 'networkidle' }); await p.goForward({ waitUntil: 'networkidle' });
      assert.equal((await geometry()).locked, '');
    }
    console.log(JSON.stringify(results, null, 2));
  } finally { clearTimeout(deadline); fs.writeFileSync(path.join(out, 'reader-navigation-results.json'), JSON.stringify(results, null, 2)); await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
