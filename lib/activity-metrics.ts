import type Database from "better-sqlite3";
/** Aggregate only identifiers and timestamps. Never reads notes, messages or discussions. */
export function usageMetrics(db: Database.Database, days: number, now = new Date()) {
  const since = (n: number) => new Date(now.getTime() - n * 86400000).toISOString();
  const scalar = (sql: string, ...args: (string | number)[]) => (db.prepare(sql).get(...args) as { n: number }).n;
  const active = (n: number) => scalar("SELECT count(distinct user_id) n FROM (SELECT user_id FROM activity_events WHERE datetime(created_at)>=datetime(?) UNION ALL SELECT user_id FROM download_events WHERE kind='read' AND datetime(created_at)>=datetime(?)) WHERE user_id IS NOT NULL", since(n), since(n));
  const events = (action: string) => scalar("SELECT count(*) n FROM activity_events WHERE action=? AND datetime(created_at)>=datetime(?)", action, since(days));
  const first = db.prepare("SELECT min(created_at) first FROM activity_events WHERE action IN ('channel.view','channel.follow','room.join','pricing.view')").get() as { first: string | null };
  return {
    activeDay: active(1), activeWeek: active(7), activeMonth: active(30),
    bookOpens: scalar("SELECT count(*) n FROM download_events WHERE kind='read' AND datetime(created_at)>=datetime(?)", since(days)),
    returningReaders: scalar("SELECT count(*) n FROM (SELECT user_id FROM download_events WHERE kind='read' AND user_id IS NOT NULL AND datetime(created_at)>=datetime(?) GROUP BY user_id HAVING count(distinct date(created_at))>=2)", since(30)),
    channelViews: events("channel.view"), channelFollows: events("channel.follow"), roomJoins: events("room.join"), pricingViews: events("pricing.view"),
    ticketPurchases: scalar("SELECT count(*) n FROM payments WHERE kind='subscription' AND status='succeeded' AND provider='yookassa' AND amount>0 AND datetime(paid_at)>=datetime(?)", since(days)),
    socialEventsSince: first.first,
  };
}
