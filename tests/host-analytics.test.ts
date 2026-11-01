import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { estimateHostIncome } from "../lib/host-economics";
import { usageMetrics } from "../lib/activity-metrics";
import { fixture, loadModule } from "./support/isolated-db";
test("preliminary host estimate matches the owner's spreadsheet without per-person rounding loss", () => {
  const standard = estimateHostIncome(20, "standard"), start = estimateHostIncome(20, "start");
  assert.equal(standard.turnover, 7980); assert.equal(Math.round(standard.base), 7382);
  assert.equal(Math.round(standard.host), 4429); assert.equal(Math.round(standard.platform), 2953);
  assert.equal(Math.round(start.host), 5167); assert.equal(Math.round(start.platform), 2214);
  assert.equal(estimateHostIncome(-2, "start").host, 0); assert.equal(estimateHostIncome(Number.NaN, "standard").host, 0);
});
test("analytics uses actual activity and successful ticket purchases across SQLite and ISO timestamps", t => {
  const db = new Database(":memory:"); t.after(() => db.close());
  db.exec(`CREATE TABLE activity_events(user_id TEXT,action TEXT,created_at TEXT); CREATE TABLE download_events(user_id TEXT,kind TEXT,created_at TEXT); CREATE TABLE payments(kind TEXT,status TEXT,provider TEXT,amount INTEGER,paid_at TEXT);
    INSERT INTO activity_events VALUES('today','pricing.view','2026-10-21 08:00:00'),('week','channel.follow','2026-10-17T12:00:00Z'),('month','room.join','2026-10-01 12:00:00'),(NULL,'channel.view','2026-10-21 09:00:00');
    INSERT INTO download_events VALUES('today','read','2026-10-21 09:00:00'),('today','read','2026-10-20 09:00:00'),('reader','read','2026-10-21 10:00:00'),('reader','read','2026-10-21 11:00:00'),('downloader','download','2026-10-21 11:00:00');
    INSERT INTO payments VALUES('subscription','succeeded','yookassa',39900,'2026-10-21T08:00:00Z'),('subscription','pending','yookassa',39900,NULL),('seminar','succeeded','yookassa',39900,'2026-10-21T08:00:00Z'),('subscription','succeeded','manual',39900,'2026-10-21T08:00:00Z');`);
  const data = usageMetrics(db, 7, new Date("2026-10-21T12:00:00Z"));
  assert.equal(data.activeDay, 2); assert.equal(data.activeWeek, 3); assert.equal(data.activeMonth, 4);
  assert.equal(data.bookOpens, 4); assert.equal(data.returningReaders, 1); assert.equal(data.channelViews, 1); assert.equal(data.channelFollows, 1); assert.equal(data.roomJoins, 0); assert.equal(data.pricingViews, 1); assert.equal(data.ticketPurchases, 1);
});
test("host audience is scoped to own rooms, deduplicates legacy tickets, and excludes banned readers", t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  f.sqlite.exec(`INSERT INTO seminars(id,title,host_user_id,status) VALUES('mine','My room','owner','open'),('theirs','Their room','other','open');
    INSERT INTO seminar_members(seminar_id,user_id,status) VALUES('mine','other','member');
    INSERT INTO seminar_tickets(id,seminar_id,user_id) VALUES('legacy','mine','other');`);
  const hosts = loadModule<{ hostOverview: (id: string) => { total: number; audience: number; people: { id: string }[] } }>("lib/db/hosts.ts", f.mocks);
  const data = hosts.hostOverview("owner"); assert.equal(data.total, 1); assert.equal(data.audience, 1); assert.equal(data.people[0].id, "other");
  f.sqlite.exec("UPDATE seminar_members SET status='banned'"); assert.equal(hosts.hostOverview("owner").audience, 0);
});
