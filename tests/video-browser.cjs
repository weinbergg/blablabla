/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
if (!process.env.BLABLA_TEST_FIXTURES) throw Error('Set BLABLA_TEST_FIXTURES');
const fixturePath = process.env.BLABLA_TEST_FIXTURES, f = JSON.parse(fs.readFileSync(fixturePath, 'utf8')), out = path.dirname(fixturePath);
const base = process.env.BLABLA_TEST_BASE_URL || 'http://127.0.0.1:3100'; if (new URL(base).hostname !== '127.0.0.1') throw Error('Local only');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 1000 } }); await ctx.addCookies([{ name: 'blabla_session', value: f.users.a.token, domain: '127.0.0.1', path: '/' }]); const p = await ctx.newPage(); p.setDefaultTimeout(30000);
    const errors = []; p.on('pageerror', e => errors.push(e.message));
    await p.goto(base + '/channels/' + f.channel.slug + '/write'); await p.locator('.tiptap').waitFor(); await p.getByLabel('Заголовок публикации').fill('Видео к следующему чтению'); await p.locator('.tiptap').fill('Небольшое видео из нашей комнаты чтения.');
    const bytes = await p.evaluate(async () => {
      const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 270;
      const paint = canvas.getContext('2d'), stream = canvas.captureStream(10), recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' }); const chunks = [];
      recorder.ondataavailable = e => chunks.push(e.data); const done = new Promise(resolve => { recorder.onstop = resolve; }); recorder.start();
      for (let i = 0; i < 12; i++) { paint.fillStyle = i % 2 ? '#b5bca6' : '#e3d8bd'; paint.fillRect(0, 0, 480, 270); paint.fillStyle = '#293235'; paint.font = '28px serif'; paint.fillText('Время читать', 120, 140); await new Promise(resolve => setTimeout(resolve, 100)); }
      recorder.stop(); await done; stream.getTracks().forEach(t => t.stop()); return Array.from(new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer()));
    });
    const file = { name: 'reading.webm', mimeType: 'video/webm', buffer: Buffer.from(bytes) };
    await p.getByRole('button', { name: 'Видео', exact: true }).click(); await p.route('**/api/community/uploads', r => r.fulfill({ status: 503, json: { error: 'Проверочный сбой загрузки' } })); await p.getByRole('dialog').locator('input[type=file]').setInputFiles(file);
    await p.getByRole('dialog').getByText('Проверочный сбой загрузки', { exact: true }).waitFor(); assert(await p.getByRole('dialog').isVisible(), 'Failed upload must keep the picker open'); assert.equal(await p.getByLabel('Подпись видео').count(), 0);
    await p.unroute('**/api/community/uploads'); await p.getByRole('dialog').locator('input[type=file]').setInputFiles(file); await p.getByRole('dialog').getByRole('button', {name:'Добавить в публикацию (1)',exact:true}).click(); await p.getByLabel('Подпись видео').fill('Встреча читателей'); await p.getByText('Черновик сохранён', { exact: true }).waitFor(); await p.getByRole('button', { name: 'Опубликовать', exact: true }).click(); await p.waitForURL(u => !u.pathname.endsWith('/write'));
    const video = p.locator('video'); await video.waitFor(); await video.scrollIntoViewIfNeeded(); await video.evaluate(async el => { el.muted = true; await el.play(); }); await p.waitForFunction(() => document.querySelector('video')?.currentTime > 0.1); await video.evaluate(el => el.pause()); assert((await video.evaluate(el => el.videoWidth)) > 0);
    const source = await video.getAttribute('src'), guest = await browser.newContext(); const response = await guest.request.get(base + source, { headers: { Range: 'bytes=0-99' } }); assert.equal(response.status(), 206); assert.equal((await response.body()).length, 100); await guest.close();
    await p.evaluate(() => scrollTo(0, 0)); await p.screenshot({ path: path.join(out, 'video-post-390.png'), fullPage: true }); assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'video-results.json'), JSON.stringify({ ok: true, checks: ['upload failure preserves editor and visible error', 'retry', 'local WebM publication', 'actual decoded video playback', 'public byte range serving'] })); console.log('Local video browser checks passed');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
