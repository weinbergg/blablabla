import "server-only";

import { randomUUID } from "crypto";
import { and, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "./client";
import { downloadEvents, payments, plans, subscriptions, users } from "./schema";
import {
  FEATURE_KEYS,
  FREE_FEATURES,
  PLAN_SEEDS,
  isFeatureKey,
  roleGrantsEverything,
  type Entitlements,
  type FeatureKey,
} from "@/lib/entitlements";

export type Plan = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  priceMonthly: number;
  priceYearly: number | null;
  priceLifetime: number | null;
  features: FeatureKey[];
  seatLimit: number | null;
  lifetime: boolean;
  accent: string | null;
  badge: string | null;
  active: boolean;
  sortOrder: number;
  /** Сколько мест уже занято — считается только для тиражных тарифов. */
  seatsTaken?: number;
};

function parseFeatures(raw: string): FeatureKey[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is FeatureKey => typeof item === "string" && isFeatureKey(item));
  } catch {
    return [];
  }
}

function rowToPlan(row: typeof plans.$inferSelect): Plan {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    description: row.description,
    priceMonthly: row.priceMonthly,
    priceYearly: row.priceYearly,
    priceLifetime: row.priceLifetime,
    features: parseFeatures(row.features),
    seatLimit: row.seatLimit,
    lifetime: Boolean(row.lifetime),
    accent: row.accent,
    badge: row.badge,
    active: Boolean(row.active),
    sortOrder: row.sortOrder,
  };
}

/**
 * Если в коде появилась новая фича, дописываем её в тарифы-семена, не трогая
 * цены и названия, которые админ уже менял руками.
 */
async function syncSeedFeatures() {
  const rows = await db.select().from(plans);
  for (const row of rows) {
    const seed = PLAN_SEEDS.find((item) => item.slug === row.slug);
    if (!seed) continue;
    const current = parseFeatures(row.features);
    const missing = seed.features.filter((key) => !current.includes(key));
    if (missing.length === 0) continue;
    await db
      .update(plans)
      .set({ features: JSON.stringify([...current, ...missing]) })
      .where(eq(plans.id, row.id));
  }
}

/** Первый запуск: заливаем стартовые тарифы, дальше истина — база. */
async function ensurePlansSeeded() {
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(plans);
  if (count > 0) {
    await syncSeedFeatures();
    return;
  }
  for (const seed of PLAN_SEEDS) {
    await db.insert(plans).values({
      id: randomUUID(),
      slug: seed.slug,
      name: seed.name,
      tagline: seed.tagline,
      description: seed.description,
      priceMonthly: seed.priceMonthly,
      priceYearly: seed.priceYearly,
      priceLifetime: seed.priceLifetime,
      features: JSON.stringify(seed.features),
      seatLimit: seed.seatLimit,
      lifetime: seed.lifetime ? 1 : 0,
      accent: seed.accent,
      badge: seed.badge,
      active: seed.active ? 1 : 0,
      sortOrder: seed.sortOrder,
    }).onConflictDoNothing();
  }
}

export async function getPlans({ onlyActive = false } = {}): Promise<Plan[]> {
  await ensurePlansSeeded();
  const rows = await db.select().from(plans).orderBy(plans.sortOrder);
  const list = rows.map(rowToPlan).filter((plan) => (onlyActive ? plan.active : true));
  const limited = list.filter((plan) => plan.seatLimit != null);
  if (limited.length > 0) {
    const taken = await countSeats(limited.map((plan) => plan.slug));
    for (const plan of limited) plan.seatsTaken = taken.get(plan.slug) ?? 0;
  }
  return list;
}

export async function getPlanBySlug(slug: string): Promise<Plan | null> {
  await ensurePlansSeeded();
  const [row] = await db.select().from(plans).where(eq(plans.slug, slug)).limit(1);
  if (!row) return null;
  const plan = rowToPlan(row);
  if (plan.seatLimit != null) {
    const taken = await countSeats([plan.slug]);
    plan.seatsTaken = taken.get(plan.slug) ?? 0;
  }
  return plan;
}

export type PlanPatch = Partial<Omit<Plan, "id" | "features" | "seatsTaken">> & {
  features?: FeatureKey[];
};

export async function updatePlan(id: string, patch: PlanPatch) {
  const update: Partial<typeof plans.$inferInsert> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.slug !== undefined) update.slug = patch.slug;
  if (patch.tagline !== undefined) update.tagline = patch.tagline;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.priceMonthly !== undefined) update.priceMonthly = patch.priceMonthly;
  if (patch.priceYearly !== undefined) update.priceYearly = patch.priceYearly;
  if (patch.priceLifetime !== undefined) update.priceLifetime = patch.priceLifetime;
  if (patch.seatLimit !== undefined) update.seatLimit = patch.seatLimit;
  if (patch.lifetime !== undefined) update.lifetime = patch.lifetime ? 1 : 0;
  if (patch.accent !== undefined) update.accent = patch.accent;
  if (patch.badge !== undefined) update.badge = patch.badge;
  if (patch.active !== undefined) update.active = patch.active ? 1 : 0;
  if (patch.sortOrder !== undefined) update.sortOrder = patch.sortOrder;
  if (patch.features !== undefined) {
    update.features = JSON.stringify(patch.features.filter((key) => FEATURE_KEYS.includes(key)));
  }
  if (Object.keys(update).length === 0) return;
  await db.update(plans).set(update).where(eq(plans.id, id));
}

/** Сколько живых подписок на каждом тиражном тарифе. */
async function countSeats(slugs: string[]) {
  const rows = await db
    .select({ planSlug: subscriptions.planSlug, count: sql<number>`count(*)` })
    .from(subscriptions)
    .where(and(eq(subscriptions.status, "active"), inArray(subscriptions.planSlug, slugs)))
    .groupBy(subscriptions.planSlug);
  return new Map(rows.map((row) => [row.planSlug, Number(row.count)]));
}

export type SubscriptionRow = typeof subscriptions.$inferSelect;

/**
 * Активная подписка пользователя. Попутно гасит просроченные строки: cron
 * здесь не нужен, статус всё равно проверяется при каждом обращении.
 */
export async function getActiveSubscription(userId: string): Promise<SubscriptionRow | null> {
  const now = new Date().toISOString();
  await db
    .update(subscriptions)
    .set({ status: "expired" })
    .where(
      and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.status, "active"),
        sql`${subscriptions.expiresAt} is not null and ${subscriptions.expiresAt} < ${now}`,
      ),
    );

  const [row] = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.status, "active"),
        or(isNull(subscriptions.expiresAt), gte(subscriptions.expiresAt, now)),
      ),
    )
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * Главная функция доступа. Возвращает плоский список фич — дальше код
 * спрашивает только про фичи, а не про названия тарифов.
 */
export async function getEntitlements(
  user: { id: string; role: string } | null,
): Promise<Entitlements> {
  if (!user) {
    return {
      planSlug: "guest",
      planName: "Гость",
      badge: null,
      accent: null,
      features: [...FREE_FEATURES],
      expiresAt: null,
      source: "free",
    };
  }

  if (roleGrantsEverything(user.role)) {
    return {
      planSlug: "staff",
      planName: user.role === "admin" ? "Админ" : "Бустер",
      badge: null,
      accent: null,
      features: [...FEATURE_KEYS],
      expiresAt: null,
      source: "role",
    };
  }

  const subscription = await getActiveSubscription(user.id);
  if (subscription) {
    const plan = await getPlanBySlug(subscription.planSlug);
    if (plan) {
      return {
        planSlug: plan.slug,
        planName: plan.name,
        badge: plan.badge,
        accent: plan.accent,
        features: plan.features,
        expiresAt: subscription.expiresAt,
        source: "subscription",
      };
    }
  }

  const free = await getPlanBySlug("free");
  return {
    planSlug: "free",
    planName: free?.name ?? "Свободный читатель",
    badge: null,
    accent: null,
    features: free?.features ?? [...FREE_FEATURES],
    expiresAt: null,
    source: "free",
  };
}

export function addPeriod(from: Date, period: "month" | "year" | "lifetime"): string | null {
  if (period === "lifetime") return null;
  const next = new Date(from);
  if (period === "year") next.setFullYear(next.getFullYear() + 1);
  else next.setMonth(next.getMonth() + 1);
  return next.toISOString();
}

/**
 * Выдать или продлить подписку. Вызывается и из вебхука ЮKassa, и из админки
 * (ручная выдача). Если активная подписка на тот же тариф уже есть — срок
 * продлевается от её конца, а не от «сегодня».
 */
export async function grantSubscription(options: {
  userId: string;
  planSlug: string;
  period: "month" | "year" | "lifetime";
  source: "yookassa" | "manual" | "founder" | "promo";
  note?: string | null;
}): Promise<SubscriptionRow> {
  const { userId, planSlug, period, source } = options;
  const plan = await getPlanBySlug(planSlug);
  if (!plan) throw new Error(`Тариф ${planSlug} не найден`);
  if (plan.seatLimit != null && (plan.seatsTaken ?? 0) >= plan.seatLimit) {
    const existing = await getActiveSubscription(userId);
    if (existing?.planSlug !== planSlug) {
      throw new Error(`Места на тариф «${plan.name}» закончились`);
    }
  }

  const now = new Date();
  const current = await getActiveSubscription(userId);
  if (current && current.planSlug === planSlug) {
    const base = current.expiresAt && new Date(current.expiresAt) > now ? new Date(current.expiresAt) : now;
    const expiresAt = plan.lifetime ? null : addPeriod(base, period);
    await db
      .update(subscriptions)
      .set({ expiresAt, period, source, note: options.note ?? current.note })
      .where(eq(subscriptions.id, current.id));
    const [updated] = await db.select().from(subscriptions).where(eq(subscriptions.id, current.id)).limit(1);
    return updated;
  }

  if (current) {
    // Переход на другой тариф: старую подписку закрываем, чтобы у человека
    // всегда была ровно одна активная строка.
    await db
      .update(subscriptions)
      .set({ status: "canceled", canceledAt: now.toISOString() })
      .where(eq(subscriptions.id, current.id));
  }

  const id = randomUUID();
  await db.insert(subscriptions).values({
    id,
    userId,
    planSlug,
    status: "active",
    period: plan.lifetime ? "lifetime" : period,
    startedAt: now.toISOString(),
    expiresAt: plan.lifetime ? null : addPeriod(now, period),
    source,
    note: options.note ?? null,
  });
  const [created] = await db.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1);
  return created;
}

export async function cancelSubscription(id: string) {
  await db
    .update(subscriptions)
    .set({ status: "canceled", canceledAt: new Date().toISOString(), autoRenew: 0 })
    .where(eq(subscriptions.id, id));
}

export type SubscriptionWithUser = SubscriptionRow & {
  userName: string;
  userEmail: string;
};

export async function listSubscriptions(limit = 200): Promise<SubscriptionWithUser[]> {
  const rows = await db
    .select({
      subscription: subscriptions,
      userName: users.name,
      userEmail: users.email,
    })
    .from(subscriptions)
    .innerJoin(users, eq(users.id, subscriptions.userId))
    .orderBy(desc(subscriptions.createdAt))
    .limit(limit);
  return rows.map((row) => ({ ...row.subscription, userName: row.userName, userEmail: row.userEmail }));
}

/* ── Платежи ─────────────────────────────────────────────────────────────── */

export type PaymentRow = typeof payments.$inferSelect;

export async function createPaymentRecord(values: {
  userId: string | null;
  kind: "subscription" | "seminar" | "campaign" | "donation";
  amount: number;
  planSlug?: string | null;
  period?: string | null;
  targetId?: string | null;
  description?: string | null;
  idempotenceKey: string;
}): Promise<PaymentRow> {
  const id = randomUUID();
  await db.insert(payments).values({
    id,
    userId: values.userId,
    kind: values.kind,
    amount: values.amount,
    planSlug: values.planSlug ?? null,
    period: values.period ?? null,
    targetId: values.targetId ?? null,
    description: values.description ?? null,
    idempotenceKey: values.idempotenceKey,
    status: "pending",
  });
  const [row] = await db.select().from(payments).where(eq(payments.id, id)).limit(1);
  return row;
}

export async function attachProviderPayment(id: string, providerPaymentId: string, payload: unknown) {
  await db
    .update(payments)
    .set({ providerPaymentId, payload: JSON.stringify(payload) })
    .where(eq(payments.id, id));
}

export async function getPaymentByProviderId(providerPaymentId: string): Promise<PaymentRow | null> {
  const [row] = await db
    .select()
    .from(payments)
    .where(eq(payments.providerPaymentId, providerPaymentId))
    .limit(1);
  return row ?? null;
}

export async function setPaymentStatus(
  id: string,
  status: PaymentRow["status"],
  payload?: unknown,
) {
  await db
    .update(payments)
    .set({
      status,
      paidAt: status === "succeeded" ? new Date().toISOString() : null,
      ...(payload === undefined ? {} : { payload: JSON.stringify(payload) }),
    })
    .where(eq(payments.id, id));
}

export type PaymentWithUser = PaymentRow & { userName: string | null };

export async function listPayments(limit = 100): Promise<PaymentWithUser[]> {
  const rows = await db
    .select({ payment: payments, userName: users.name })
    .from(payments)
    .leftJoin(users, eq(users.id, payments.userId))
    .orderBy(desc(payments.createdAt))
    .limit(limit);
  return rows.map((row) => ({ ...row.payment, userName: row.userName }));
}

/* ── Журнал выдачи файлов ────────────────────────────────────────────────── */

export async function recordDownload(values: {
  userId: string | null;
  documentId: string | null;
  kind: "read" | "download" | "zip" | "opds";
  ip: string | null;
  userAgent: string | null;
}) {
  await db.insert(downloadEvents).values({
    id: randomUUID(),
    userId: values.userId,
    documentId: values.documentId,
    kind: values.kind,
    ip: values.ip,
    userAgent: values.userAgent?.slice(0, 300) ?? null,
  });
}

/** Сколько файлов человек (или IP) забрал за последние сутки. Чтение онлайн
 * не считается — лимит про выгрузку файлов, а не про доступ к библиотеке. */
export async function countDownloadsLastDay(options: { userId?: string | null; ip?: string | null }) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const scope = options.userId
    ? eq(downloadEvents.userId, options.userId)
    : options.ip
      ? eq(downloadEvents.ip, options.ip)
      : null;
  if (!scope) return 0;
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(downloadEvents)
    .where(
      and(
        scope,
        gte(downloadEvents.createdAt, since),
        inArray(downloadEvents.kind, ["download", "zip", "opds"]),
      ),
    );
  return Number(row?.count ?? 0);
}
