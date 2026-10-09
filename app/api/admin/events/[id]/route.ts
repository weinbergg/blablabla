import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createSucceededManualPayment } from "@/lib/db/billing";
import {
  applyCampaignPayment,
  clampDonation,
  getCampaignById,
  getSeminarById,
  grantSeminarTicket,
  updateCampaign,
  updateSeminar,
} from "@/lib/db/events";
import { rublesToKopeks } from "@/lib/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEMINAR_STATUS = new Set(["draft", "open", "closed", "done"]);
const CAMPAIGN_STATUS = new Set(["draft", "open", "funded", "closed"]);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (user?.role !== "admin") {
    return NextResponse.json({ error: "Доступ только для админов" }, { status: 403 });
  }
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    kind?: "seminar" | "campaign";
    title?: string;
    summary?: string | null;
    body?: string;
    location?: string | null;
    startsAt?: string | null;
    priceRubles?: number;
    discountPercent?: number;
    seatLimit?: number | null;
    goalRubles?: number;
    documentId?: string | null;
    status?: string;
  } | null;

  try {
    if (body?.kind === "seminar") {
      if (!(await getSeminarById(id))) return NextResponse.json({ error: "Встреча не найдена" }, { status: 404 });
      await updateSeminar(id, {
        title: body.title,
        summary: body.summary,
        body: body.body,
        location: body.location,
        startsAt: body.startsAt,
        priceKopeks: body.priceRubles !== undefined ? rublesToKopeks(body.priceRubles) : undefined,
        discountPercent: body.discountPercent,
        seatLimit: body.seatLimit,
        status: body.status && SEMINAR_STATUS.has(body.status) ? (body.status as "draft") : undefined,
      });
      return NextResponse.json({ ok: true });
    }
    if (body?.kind === "campaign") {
      if (!(await getCampaignById(id))) return NextResponse.json({ error: "Сбор не найден" }, { status: 404 });
      await updateCampaign(id, {
        title: body.title,
        summary: body.summary,
        body: body.body,
        goalKopeks: body.goalRubles !== undefined ? rublesToKopeks(body.goalRubles) : undefined,
        documentId: body.documentId,
        status: body.status && CAMPAIGN_STATUS.has(body.status) ? (body.status as "draft") : undefined,
      });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Нужно указать kind" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось сохранить" },
      { status: 400 },
    );
  }
}

/** Ручная запись: перевод мимо кассы, наличные, подарок. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (admin?.role !== "admin") {
    return NextResponse.json({ error: "Доступ только для админов" }, { status: 403 });
  }
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    action?: "ticket" | "donation";
    userId?: string;
    amountRubles?: number;
  } | null;

  if (body?.action === "ticket") {
    const seminar = await getSeminarById(id);
    if (!seminar) return NextResponse.json({ error: "Встреча не найдена" }, { status: 404 });
    if (!body.userId) return NextResponse.json({ error: "Нужен id читателя" }, { status: 400 });
    await grantSeminarTicket({ seminarId: seminar.id, userId: body.userId, source: "manual" });
    return NextResponse.json({ ok: true });
  }

  if (body?.action === "donation") {
    const campaign = await getCampaignById(id);
    if (!campaign) return NextResponse.json({ error: "Сбор не найден" }, { status: 404 });
    let amount: number;
    try {
      amount = clampDonation(rublesToKopeks(body.amountRubles ?? 0));
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Некорректная сумма" },
        { status: 400 },
      );
    }
    await createSucceededManualPayment({
      userId: body.userId || null,
      kind: "campaign",
      amount,
      targetId: campaign.id,
      description: `Взнос вручную: ${campaign.title}`,
    });
    await applyCampaignPayment(campaign.id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
}
