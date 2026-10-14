import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPlanBySlug } from "@/lib/db/billing";
import { startYooKassaCheckout } from "@/lib/payments/start-checkout";

export const runtime = "nodejs";

/**
 * Шаг 1 оплаты подписки: создаём платёж в ЮKassa и отдаём ссылку.
 * Подписку включаем только после succeeded (вебхук или /api/billing/sync).
 * autoRenew — отдельная галочка, по оферте по умолчанию выключена.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Нужно войти в аккаунт" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as {
    planSlug?: string;
    period?: "month" | "year" | "lifetime";
    autoRenew?: boolean;
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

  const autoRenew = Boolean(payload?.autoRenew) && period !== "lifetime";
  const started = await startYooKassaCheckout({
    request,
    user,
    kind: "subscription",
    amount,
    description: `blablablarden — ${plan.name}`,
    itemDescription: plan.name,
    returnPath: "/account",
    planSlug: plan.slug,
    period,
    savePaymentMethod: autoRenew,
    metadata: { autoRenew: autoRenew ? "1" : "0", planSlug: plan.slug, period },
  });

  if (!started.ok) {
    return NextResponse.json({ error: started.error }, { status: started.status });
  }
  return NextResponse.json({ paymentId: started.paymentId, confirmationUrl: started.confirmationUrl });
}
