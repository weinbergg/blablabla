import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  attachProviderPayment,
  createPaymentRecord,
  getPlanBySlug,
} from "@/lib/db/billing";
import { getSiteConfig } from "@/lib/db/settings";
import { createPayment, getCredentials } from "@/lib/payments/yookassa";

export const runtime = "nodejs";

/**
 * Шаг 1 оплаты: создаём запись о платеже у себя и платёж в ЮKassa, отдаём
 * клиенту ссылку на оплату. Подписку здесь НЕ включаем — только после
 * подтверждения от банка в вебхуке.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Нужно войти в аккаунт" }, { status: 401 });
  }

  const config = await getSiteConfig();
  if (!config.paymentsEnabled) {
    return NextResponse.json({ error: "Приём платежей пока выключен" }, { status: 503 });
  }

  const payload = (await request.json().catch(() => null)) as {
    planSlug?: string;
    period?: "month" | "year" | "lifetime";
  } | null;

  const planSlug = payload?.planSlug?.trim();
  const period = payload?.period ?? "month";
  if (!planSlug || !["month", "year", "lifetime"].includes(period)) {
    return NextResponse.json({ error: "Не указан тариф" }, { status: 400 });
  }

  const plan = await getPlanBySlug(planSlug);
  if (!plan || !plan.active) {
    return NextResponse.json({ error: "Тариф недоступен" }, { status: 404 });
  }
  if (plan.seatLimit != null && (plan.seatsTaken ?? 0) >= plan.seatLimit) {
    return NextResponse.json({ error: "Места на этом уровне закончились" }, { status: 409 });
  }

  const amount =
    period === "year" ? plan.priceYearly : period === "lifetime" ? plan.priceLifetime : plan.priceMonthly;
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "Для этого тарифа нет такой оплаты" }, { status: 400 });
  }

  const credentials = getCredentials(config.yookassaMode);
  if (!credentials) {
    return NextResponse.json(
      { error: "Платёжный модуль не настроен: нет ключей ЮKassa" },
      { status: 503 },
    );
  }

  const idempotenceKey = randomUUID();
  const record = await createPaymentRecord({
    userId: user.id,
    kind: "subscription",
    amount,
    planSlug: plan.slug,
    period,
    description: `${plan.name}, ${period === "year" ? "год" : period === "lifetime" ? "навсегда" : "месяц"}`,
    idempotenceKey,
  });

  const origin = new URL(request.url).origin;

  try {
    const payment = await createPayment({
      credentials,
      amount,
      description: `blablablarden — ${plan.name}`,
      returnUrl: `${origin}/account?payment=${record.id}`,
      idempotenceKey,
      metadata: { paymentId: record.id, userId: user.id, planSlug: plan.slug, period },
      receipt: config.receiptsEnabled ? { customerEmail: user.email, itemDescription: plan.name } : null,
    });

    await attachProviderPayment(record.id, payment.id, payment);
    const confirmationUrl = payment.confirmation?.confirmation_url;
    if (!confirmationUrl) {
      return NextResponse.json({ error: "ЮKassa не вернула ссылку на оплату" }, { status: 502 });
    }
    return NextResponse.json({ paymentId: record.id, confirmationUrl });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось создать платёж" },
      { status: 502 },
    );
  }
}
