import { featureDenied } from "@/lib/features";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getEntitlements } from "@/lib/db/billing";
import {
  clampDonation,
  countSeminarSeats,
  getCampaignById,
  getSeminarById,
  getTicket,
  grantSeminarTicket,
  seminarPriceFor,
} from "@/lib/db/events";
import { startYooKassaCheckout } from "@/lib/payments/start-checkout";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Нужно войти в аккаунт" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as {
    kind?: "seminar" | "campaign";
    targetId?: string;
    amount?: number;
  } | null;

  if (payload?.kind === "seminar") {
    const seminar = payload.targetId ? await getSeminarById(payload.targetId) : null;
    if (!seminar || seminar.status !== "open") {
      return NextResponse.json({ error: "Запись на эту встречу закрыта" }, { status: 404 });
    }
    const disabled = await featureDenied(seminar.priceKopeks > 0 ? ["rooms", "paid_events"] : ["rooms"], user); if (disabled) return disabled;
    if (seminar.roomEnabled) return NextResponse.json({ error: "Оплата программ ведущих пока не активирована. Доступ выдаёт ведущий." }, { status: 403 });
    if (await getTicket(seminar.id, user.id)) {
      return NextResponse.json({ error: "Вы уже записаны" }, { status: 409 });
    }
    const taken = await countSeminarSeats(seminar.id);
    if (seminar.seatLimit != null && taken >= seminar.seatLimit) {
      return NextResponse.json({ error: "Мест больше нет" }, { status: 409 });
    }
    const entitlements = await getEntitlements(user);
    const amount = seminarPriceFor(seminar, entitlements);
    if (amount <= 0) {
      await grantSeminarTicket({ seminarId: seminar.id, userId: user.id, source: "manual" });
      return NextResponse.json({ ok: true, free: true });
    }
    const started = await startYooKassaCheckout({
      request,
      user,
      kind: "seminar",
      amount,
      description: `Встреча: ${seminar.title}`,
      itemDescription: seminar.title,
      returnPath: `/seminars/${seminar.slug}`,
      targetId: seminar.id,
    });
    if (!started.ok) return NextResponse.json({ error: started.error }, { status: started.status });
    return NextResponse.json({ paymentId: started.paymentId, confirmationUrl: started.confirmationUrl });
  }

  if (payload?.kind === "campaign") {
    const campaign = payload.targetId ? await getCampaignById(payload.targetId) : null;
    if (!campaign || campaign.status !== "open") {
      return NextResponse.json({ error: "Этот сбор сейчас не принимает взносы" }, { status: 404 });
    }
    let amount: number;
    try {
      amount = clampDonation(Number(payload.amount) || 0);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Некорректная сумма" },
        { status: 400 },
      );
    }
    const started = await startYooKassaCheckout({
      request,
      user,
      kind: "campaign",
      amount,
      description: `Сбор: ${campaign.title}`,
      itemDescription: campaign.title,
      returnPath: `/campaigns/${campaign.slug}`,
      targetId: campaign.id,
    });
    if (!started.ok) return NextResponse.json({ error: started.error }, { status: started.status });
    return NextResponse.json({ paymentId: started.paymentId, confirmationUrl: started.confirmationUrl });
  }

  return NextResponse.json({ error: "Не указано, что оплачивать" }, { status: 400 });
}
