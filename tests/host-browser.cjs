/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), Database = require('better-sqlite3');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
if (!process.env.BLABLA_TEST_FIXTURES) throw Error('Set BLABLA_TEST_FIXTURES');
const fixturePath = process.env.BLABLA_TEST_FIXTURES, f = JSON.parse(fs.readFileSync(fixturePath, 'utf8')), out = path.dirname(fixturePath);
if (!path.basename(out).startsWith('blabla-browser-') || path.resolve(f.databasePath) !== path.join(path.resolve(out), 'test.db')) throw Error('Disposable browser copy required');
const base = process.env.BLABLA_TEST_BASE_URL || 'http://127.0.0.1:3100'; if (new URL(base).hostname !== '127.0.0.1') throw Error('Local only');
(async () => {
  const db = new Database(f.databasePath), role = db.prepare('SELECT role FROM users WHERE id=?').get(f.users.c.id).role;
  db.prepare("UPDATE users SET role='admin' WHERE id=?").run(f.users.c.id);
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, headless: true });
  try {
    const owner = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), admin = await browser.newContext();
    for (const [ctx, u] of [[owner, f.users.a], [admin, f.users.c]]) await ctx.addCookies([{ name: 'blabla_session', value: u.token, domain: '127.0.0.1', path: '/' }]);
    const p = await owner.newPage(), q = await admin.newPage(); const errors = []; for (const page of [p, q]) { page.setDefaultTimeout(30000); page.on('pageerror', e => errors.push(e.message)); }
    // Reuse the existing invitation workflow, without sending a message to anyone.
    const invite = await owner.request.post(base + '/api/invites', { data: { note: 'Browser acceptance', multiUse: true } }); assert(invite.ok());
    await p.goto(base + '/hosts'); await p.getByLabel('Число подписчиков программы').fill('20');
    assert.equal((await p.locator('[data-host-estimate]').innerText()).replace(/\s/g, ''), '≈4429₽');
    await p.getByRole('radio', { name: 'Старт · 70%' }).check(); assert.equal((await p.locator('[data-host-estimate]').innerText()).replace(/\s/g, ''), '≈5167₽');
    await p.getByLabel('Число подписчиков программы').fill('0'); assert.equal((await p.locator('[data-host-estimate]').innerText()).replace(/\s/g, ''), '≈0₽');
    await p.goto(base + '/hosts/dashboard'); await p.getByRole('heading', { name: 'Ваши чтения и читатели' }).waitFor();
    await p.getByRole('button', { name: 'Скопировать приглашение' }).waitFor();
    const own = db.prepare('SELECT slug FROM seminars WHERE host_user_id=?').all(f.users.a.id);
    for (const room of own.slice(0, 20)) assert(await p.locator(`a[href="/seminars/${room.slug}"]`).count() > 0);
    const before = db.prepare("SELECT count(*) n FROM activity_events WHERE action='pricing.view' AND user_id=?").get(f.users.a.id).n;
    const viewed = p.waitForResponse(r => r.url().endsWith('/api/activity/page-view') && r.status() === 200);
    await p.goto(base + '/pricing'); await p.locator('#programmes').waitFor(); await viewed;
    assert.equal(db.prepare("SELECT count(*) n FROM activity_events WHERE action='pricing.view' AND user_id=?").get(f.users.a.id).n, before + 1);
    assert.equal(await p.locator('#programmes').getByRole('button').count(), 0, 'Host programmes must not charge payments');
    assert.equal((await owner.request.get(base + '/api/admin/activity')).status(), 403);
    const metrics = await (await admin.request.get(base + '/api/admin/activity?days=14')).json();
    assert.equal(metrics.metrics.ticketPurchases, db.prepare("SELECT count(*) n FROM payments WHERE kind='subscription' AND status='succeeded' AND provider='yookassa' AND amount>0 AND datetime(paid_at)>=datetime('now','-14 days')").get().n);
    await q.goto(base + '/admin'); await q.getByRole('button', { name: 'Активность', exact: true }).click(); await q.getByText('Активны · 24 часа', { exact: true }).waitFor(); await q.getByLabel('Период аналитики').selectOption('30'); await q.getByText('Активны · 24 часа', { exact: true }).waitFor();
    for (const width of [1440, 1024, 768, 390, 320]) {
      await p.bringToFront(); await p.setViewportSize({ width, height: 1000 });
      for (const [name, route] of [['hosts', '/hosts'], ['host-dashboard', '/hosts/dashboard'], ['pricing', '/pricing']]) {
        await p.goto(base + route); await p.locator('main').waitFor(); await p.evaluate(() => scrollTo(0, 0));
        assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), name + ' overflow ' + width);
        await p.screenshot({ path: path.join(out, name + '-' + width + '.png'), fullPage: true });
      }
      await q.bringToFront(); await q.setViewportSize({ width, height: 1000 }); await q.evaluate(async () => { scrollTo(0, 0); await document.fonts.ready; await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
      assert(await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'analytics overflow ' + width);
      await q.screenshot({ path: path.join(out, 'analytics-' + width + '.png'), fullPage: true });
    }
    assert.deepEqual(errors, []); fs.writeFileSync(path.join(out, 'host-results.json'), JSON.stringify({ ok: true, checks: ['calculator spreadsheet examples', 'actual own rooms', 'existing invitations', 'no host checkout', 'pricing view event', 'admin-only real metrics', 'five widths', 'no hydration errors'] })); console.log('Host and analytics browser checks passed');
  } finally { db.prepare('UPDATE users SET role=? WHERE id=?').run(role, f.users.c.id); db.close(); await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
