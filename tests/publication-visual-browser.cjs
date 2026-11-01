/* eslint-disable @typescript-eslint/no-require-imports */
// Read-only visual follow-up to publication-attachments-browser.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
if (!process.env.BLABLA_TEST_FIXTURES) throw Error('Isolated fixtures required');
const f = JSON.parse(fs.readFileSync(process.env.BLABLA_TEST_FIXTURES)), out = path.dirname(process.env.BLABLA_TEST_FIXTURES);
const base = process.env.BLABLA_TEST_BASE_URL || 'http://127.0.0.1:3102';
if (new URL(base).hostname !== '127.0.0.1') throw Error('Local only');
const prior = JSON.parse(fs.readFileSync(path.join(out, 'publication-attachments-results.json')));
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, headless: true });
  try {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    await context.addCookies([{ name: 'blabla_session', value: f.users.a.token, domain: '127.0.0.1', path: '/' }]);
    const p = await context.newPage();
    for (const [name, route] of [['publication-sources', new URL(prior.postUrl).pathname], ['channel-library', '/channels/' + f.channel.slug + '?tab=media&media=book']]) {
      await p.goto(base + route, { waitUntil: 'networkidle' });
      for (const width of [1440, 1024, 768, 430, 390, 375, 320]) {
        await p.bringToFront(); await p.setViewportSize({ width, height: 900 });
        await p.evaluate(async () => { await document.fonts.ready; scrollTo(0, 0); }); await p.waitForTimeout(400);
        assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        assert(await p.locator(name === 'channel-library' ? 'h1' : 'article h2').first().evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'Heading clipped at ' + width);
        if (name === 'publication-sources') assert.equal(await p.locator('header').count(), 1, 'Duplicate site header');
        await p.screenshot({ path: path.join(out, name + '-' + width + '.png'), fullPage: true });
      }
      await p.setViewportSize({ width: 844, height: 390 }); await p.waitForTimeout(400);
      assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }
    console.log('Visual follow-up passed: seven widths, landscape, reduced motion, no clipped headings or duplicate DOM header');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
