import "server-only";
import { usageMetrics } from "@/lib/activity-metrics";

import { and, desc, eq, sql } from "drizzle-orm";
import { db, sqlite } from "./client";
import { activityEvents, subscriptions, users } from "./schema";

function sinceDays(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export async function getActivityOverview(days = 14) {
  const since = sinceDays(days);
  const [byAction, daily, usersTouch, recent] = await Promise.all([
    db
      .select({
        action: activityEvents.action,
        n: sql<number>`count(*)`,
      })
      .from(activityEvents)
      .where(sql`datetime(${activityEvents.createdAt})>=datetime(${since})`)
      .groupBy(activityEvents.action),
    db
      .select({
        day: sql<string>`substr(created_at, 1, 10)`,
        n: sql<number>`count(*)`,
        people: sql<number>`count(distinct user_id)`,
      })
      .from(activityEvents)
      .where(sql`datetime(${activityEvents.createdAt})>=datetime(${since})`)
      .groupBy(sql`substr(created_at, 1, 10)`)
      .orderBy(sql`substr(created_at, 1, 10)`),
    db
      .select({ n: sql<number>`count(distinct user_id)` })
      .from(activityEvents)
      .where(sql`datetime(${activityEvents.createdAt})>=datetime(${since})`),
    db
      .select({
        id: activityEvents.id,
        action: activityEvents.action,
        email: activityEvents.email,
        userId: activityEvents.userId,
        targetType: activityEvents.targetType,
        targetId: activityEvents.targetId,
        createdAt: activityEvents.createdAt,
      })
      .from(activityEvents)
      .orderBy(desc(activityEvents.createdAt))
      .limit(80),
  ]);

  const lastWeek = sinceDays(7);
  const activeIds = await db
    .select({ userId: activityEvents.userId })
    .from(activityEvents)
    .where(and(sql`datetime(${activityEvents.createdAt})>=datetime(${lastWeek})`))
    .groupBy(activityEvents.userId);

  const ids = activeIds.map((row) => row.userId).filter((id): id is string => Boolean(id));
  const paid = ids.length
    ? await db
        .select({ userId: subscriptions.userId })
        .from(subscriptions)
        .where(and(eq(subscriptions.status, "active")))
    : [];
  const paidSet = new Set(paid.map((row) => row.userId));

  const segments = {
    active7d: ids.length,
    activeFree: ids.filter((id) => !paidSet.has(id)).length,
    activePaid: ids.filter((id) => paidSet.has(id)).length,
  };

  const people = await db.select({ n: sql<number>`count(*)` }).from(users);

  return {
    days,
    metrics: usageMetrics(sqlite, days),
    totalPeople: Number(people[0]?.n ?? 0),
    activePeople: Number(usersTouch[0]?.n ?? 0),
    byAction: byAction.map((row) => ({ action: row.action, n: Number(row.n) })),
    daily: daily.map((row) => ({ day: row.day, n: Number(row.n), people: Number(row.people) })),
    recent,
    segments,
  };
}
