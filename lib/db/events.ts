import "server-only";

import { randomUUID } from "crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "./client";
import { campaigns, documents, payments, seminarTickets, seminars, users } from "./schema";
import { slugify } from "@/lib/transliterate";
import type { Entitlements } from "@/lib/entitlements";
import { hasFeature } from "@/lib/entitlements";

const RESERVED = new Set(["new", "admin", "index", "library"]);
const MIN_DONATION = 10000;
const MAX_DONATION = 1_000_000_00;

export type SeminarRow = typeof seminars.$inferSelect;
export type CampaignRow = typeof campaigns.$inferSelect;

function uniqueSlug(title: string, extra: string) {
  const base = slugify(title) || "zapis";
  const suffix = extra.replace(/-/g, "").slice(0, 6);
  return `${base.slice(0, 48)}-${suffix}`;
}

async function takeSlug(title: string, exists: (slug: string) => Promise<boolean>) {
  let slug = slugify(title) || uniqueSlug(title, randomUUID());
  if (RESERVED.has(slug) || (await exists(slug))) slug = uniqueSlug(title, randomUUID());
  return slug;
}

export function seminarPriceFor(seminar: { priceKopeks: number; discountPercent: number }, entitlements: Entitlements | null) {
  if (hasFeature(entitlements, "seminars.discount") && seminar.discountPercent > 0) {
    return Math.max(0, Math.round((seminar.priceKopeks * (100 - seminar.discountPercent)) / 100));
  }
  return seminar.priceKopeks;
}

export async function listPublicSeminars() {
  const rows = await db
    .select({
      seminar: seminars,
      seatsTaken: sql<number>`(select count(*) from seminar_tickets where seminar_id = seminars.id)`,
    })
    .from(seminars)
    .where(eq(seminars.status, "open"))
    .orderBy(seminars.startsAt, desc(seminars.createdAt));
  return rows.map((row) => ({ ...row.seminar, seatsTaken: Number(row.seatsTaken) || 0 }));
}

export async function listAllSeminars() {
  const rows = await db
    .select({
      seminar: seminars,
      seatsTaken: sql<number>`(select count(*) from seminar_tickets where seminar_id = seminars.id)`,
    })
    .from(seminars)
    .orderBy(desc(seminars.createdAt));
  return rows.map((row) => ({ ...row.seminar, seatsTaken: Number(row.seatsTaken) || 0 }));
}

export async function getSeminarBySlug(slug: string) {
  const [row] = await db
    .select({
      seminar: seminars,
      seatsTaken: sql<number>`(select count(*) from seminar_tickets where seminar_id = seminars.id)`,
    })
    .from(seminars)
    .where(eq(seminars.slug, slug))
    .limit(1);
  if (!row) return null;
  return { ...row.seminar, seatsTaken: Number(row.seatsTaken) || 0 };
}

export async function getSeminarById(id: string) {
  const [row] = await db.select().from(seminars).where(eq(seminars.id, id)).limit(1);
  return row ?? null;
}

export async function countSeminarSeats(seminarId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(seminarTickets)
    .where(eq(seminarTickets.seminarId, seminarId));
  return Number(row?.count ?? 0);
}

export async function getTicket(seminarId: string, userId: string) {
  const [row] = await db
    .select()
    .from(seminarTickets)
    .where(and(eq(seminarTickets.seminarId, seminarId), eq(seminarTickets.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function listTicketsForUser(userId: string) {
  return db
    .select({
      id: seminarTickets.id,
      createdAt: seminarTickets.createdAt,
      source: seminarTickets.source,
      seminarId: seminars.id,
      slug: seminars.slug,
      title: seminars.title,
      startsAt: seminars.startsAt,
      status: seminars.status,
    })
    .from(seminarTickets)
    .innerJoin(seminars, eq(seminars.id, seminarTickets.seminarId))
    .where(eq(seminarTickets.userId, userId))
    .orderBy(desc(seminarTickets.createdAt));
}

export async function createSeminar(input: {
  title: string;
  summary?: string | null;
  body?: string;
  location?: string | null;
  startsAt?: string | null;
  priceKopeks?: number;
  discountPercent?: number;
  seatLimit?: number | null;
  status?: SeminarRow["status"];
}) {
  const title = input.title.trim().slice(0, 160);
  if (title.length < 2) throw new Error("Нужно название встречи");
  const slug = await takeSlug(title, async (value) => Boolean(await getSeminarBySlug(value)));
  const id = randomUUID();
  await db.insert(seminars).values({
    id,
    slug,
    title,
    summary: input.summary?.trim().slice(0, 400) || null,
    body: (input.body ?? "").trim().slice(0, 20_000),
    location: input.location?.trim().slice(0, 200) || null,
    startsAt: input.startsAt || null,
    priceKopeks: Math.max(0, Math.round(input.priceKopeks ?? 200000)),
    discountPercent: Math.min(90, Math.max(0, Math.round(input.discountPercent ?? 20))),
    seatLimit: input.seatLimit && input.seatLimit > 0 ? Math.round(input.seatLimit) : null,
    status: input.status ?? "draft",
  });
  return getSeminarById(id);
}

export async function updateSeminar(
  id: string,
  patch: Partial<{
    title: string;
    summary: string | null;
    body: string;
    location: string | null;
    startsAt: string | null;
    priceKopeks: number;
    discountPercent: number;
    seatLimit: number | null;
    status: SeminarRow["status"];
  }>,
) {
  const update: Partial<typeof seminars.$inferInsert> = {};
  if (patch.title !== undefined) update.title = patch.title.trim().slice(0, 160);
  if (patch.summary !== undefined) update.summary = patch.summary?.trim().slice(0, 400) || null;
  if (patch.body !== undefined) update.body = patch.body.trim().slice(0, 20_000);
  if (patch.location !== undefined) update.location = patch.location?.trim().slice(0, 200) || null;
  if (patch.startsAt !== undefined) update.startsAt = patch.startsAt || null;
  if (patch.priceKopeks !== undefined) update.priceKopeks = Math.max(0, Math.round(patch.priceKopeks));
  if (patch.discountPercent !== undefined) {
    update.discountPercent = Math.min(90, Math.max(0, Math.round(patch.discountPercent)));
  }
  if (patch.seatLimit !== undefined) {
    update.seatLimit = patch.seatLimit && patch.seatLimit > 0 ? Math.round(patch.seatLimit) : null;
  }
  if (patch.status !== undefined) update.status = patch.status;
  if (Object.keys(update).length === 0) return;
  await db.update(seminars).set(update).where(eq(seminars.id, id));
}

export async function grantSeminarTicket(options: {
  seminarId: string;
  userId: string;
  paymentId?: string | null;
  source: "yookassa" | "manual";
}) {
  const existing = await getTicket(options.seminarId, options.userId);
  if (existing) return existing;
  const id = randomUUID();
  try {
    await db.insert(seminarTickets).values({
      id,
      seminarId: options.seminarId,
      userId: options.userId,
      paymentId: options.paymentId ?? null,
      source: options.source,
    });
  } catch {
    const again = await getTicket(options.seminarId, options.userId);
    if (again) return again;
    throw new Error("Не удалось записать место");
  }
  return getTicket(options.seminarId, options.userId);
}

export async function campaignRaised(campaignId: string) {
  const [row] = await db
    .select({ sum: sql<number>`coalesce(sum(amount), 0)` })
    .from(payments)
    .where(
      and(eq(payments.kind, "campaign"), eq(payments.targetId, campaignId), eq(payments.status, "succeeded")),
    );
  return Number(row?.sum ?? 0);
}

export type CampaignPublic = CampaignRow & {
  raisedKopeks: number;
  backerCount: number;
  documentTitle: string | null;
};

async function withCampaignStats(row: CampaignRow, documentTitle: string | null): Promise<CampaignPublic> {
  const [sumRow, countRow] = await Promise.all([
    db
      .select({ sum: sql<number>`coalesce(sum(amount), 0)` })
      .from(payments)
      .where(and(eq(payments.kind, "campaign"), eq(payments.targetId, row.id), eq(payments.status, "succeeded"))),
    db
      .select({ count: sql<number>`count(distinct user_id)` })
      .from(payments)
      .where(and(eq(payments.kind, "campaign"), eq(payments.targetId, row.id), eq(payments.status, "succeeded"))),
  ]);
  return {
    ...row,
    raisedKopeks: Number(sumRow[0]?.sum ?? 0),
    backerCount: Number(countRow[0]?.count ?? 0),
    documentTitle,
  };
}

export async function listPublicCampaigns() {
  const rows = await db
    .select({ campaign: campaigns, documentTitle: documents.title })
    .from(campaigns)
    .leftJoin(documents, eq(documents.id, campaigns.documentId))
    .orderBy(desc(campaigns.createdAt));
  const visible = rows.filter((row) => row.campaign.status === "open" || row.campaign.status === "funded");
  return Promise.all(visible.map((row) => withCampaignStats(row.campaign, row.documentTitle)));
}

export async function listAllCampaigns() {
  const rows = await db
    .select({ campaign: campaigns, documentTitle: documents.title })
    .from(campaigns)
    .leftJoin(documents, eq(documents.id, campaigns.documentId))
    .orderBy(desc(campaigns.createdAt));
  return Promise.all(rows.map((row) => withCampaignStats(row.campaign, row.documentTitle)));
}

export async function getCampaignBySlug(slug: string) {
  const [row] = await db
    .select({ campaign: campaigns, documentTitle: documents.title })
    .from(campaigns)
    .leftJoin(documents, eq(documents.id, campaigns.documentId))
    .where(eq(campaigns.slug, slug))
    .limit(1);
  if (!row) return null;
  return withCampaignStats(row.campaign, row.documentTitle);
}

export async function getCampaignById(id: string) {
  const [row] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  return row ?? null;
}

export async function getFundedCampaignForDocument(documentId: string) {
  const [row] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.documentId, documentId), eq(campaigns.status, "funded")))
    .orderBy(desc(campaigns.completedAt))
    .limit(1);
  if (!row) return null;
  const thanks = await listCampaignThanks(row.id);
  return { ...row, thanks };
}

export async function listCampaignThanks(campaignId: string) {
  const rows = await db
    .select({
      userId: payments.userId,
      name: users.name,
      amount: sql<number>`sum(${payments.amount})`,
    })
    .from(payments)
    .leftJoin(users, eq(users.id, payments.userId))
    .where(
      and(eq(payments.kind, "campaign"), eq(payments.targetId, campaignId), eq(payments.status, "succeeded")),
    )
    .groupBy(payments.userId, users.name)
    .orderBy(desc(sql`sum(${payments.amount})`));
  return rows.map((row) => ({
    userId: row.userId,
    name: row.name?.trim() || "Читатель",
    amount: Number(row.amount) || 0,
  }));
}

export async function createCampaign(input: {
  title: string;
  summary?: string | null;
  body?: string;
  goalKopeks: number;
  documentId?: string | null;
  status?: CampaignRow["status"];
}) {
  const title = input.title.trim().slice(0, 160);
  if (title.length < 2) throw new Error("Нужно название сбора");
  const goalKopeks = Math.round(input.goalKopeks);
  if (goalKopeks < MIN_DONATION) throw new Error("Цель сбора слишком маленькая");
  if (input.documentId) {
    const [book] = await db.select({ id: documents.id }).from(documents).where(eq(documents.id, input.documentId)).limit(1);
    if (!book) throw new Error("Книга не найдена");
  }
  const slug = await takeSlug(title, async (value) => Boolean(await getCampaignBySlug(value)));
  const id = randomUUID();
  await db.insert(campaigns).values({
    id,
    slug,
    title,
    summary: input.summary?.trim().slice(0, 400) || null,
    body: (input.body ?? "").trim().slice(0, 20_000),
    goalKopeks,
    documentId: input.documentId || null,
    status: input.status ?? "draft",
  });
  return getCampaignById(id);
}

export async function updateCampaign(
  id: string,
  patch: Partial<{
    title: string;
    summary: string | null;
    body: string;
    goalKopeks: number;
    documentId: string | null;
    status: CampaignRow["status"];
  }>,
) {
  const current = await getCampaignById(id);
  if (!current) throw new Error("Сбор не найден");
  const update: Partial<typeof campaigns.$inferInsert> = {};
  if (patch.title !== undefined) update.title = patch.title.trim().slice(0, 160);
  if (patch.summary !== undefined) update.summary = patch.summary?.trim().slice(0, 400) || null;
  if (patch.body !== undefined) update.body = patch.body.trim().slice(0, 20_000);
  if (patch.goalKopeks !== undefined) update.goalKopeks = Math.max(MIN_DONATION, Math.round(patch.goalKopeks));
  if (patch.documentId !== undefined) update.documentId = patch.documentId || null;
  if (patch.status !== undefined) {
    update.status = patch.status;
    if (patch.status === "funded" && !current.completedAt) {
      update.completedAt = new Date().toISOString();
    }
  }
  if (Object.keys(update).length === 0) return;
  await db.update(campaigns).set(update).where(eq(campaigns.id, id));
}

export async function applyCampaignPayment(campaignId: string) {
  const campaign = await getCampaignById(campaignId);
  if (!campaign) return;
  const raised = await campaignRaised(campaignId);
  if (campaign.status === "open" && raised >= campaign.goalKopeks) {
    await db
      .update(campaigns)
      .set({ status: "funded", completedAt: new Date().toISOString() })
      .where(eq(campaigns.id, campaignId));
  }
}

export function clampDonation(amount: number) {
  const value = Math.round(amount);
  if (value < MIN_DONATION) throw new Error(`Минимальный взнос — ${MIN_DONATION / 100} ₽`);
  if (value > MAX_DONATION) throw new Error("Слишком большая сумма");
  return value;
}

export { MIN_DONATION };
