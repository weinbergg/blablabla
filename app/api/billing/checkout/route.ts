import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getActiveSubscription, getPlanBySlug } from "@/lib/db/billing";
import { checkoutCharge } from "@/lib/plan-charge";
import { startYooKassaCheckout } from "@/lib/payments/start-checkout";

export const runtime = "nodejs";

/**
 * Оформление или повышение тарифа. Сумму считает сервер: клиенту не верим.
 * Понижение отклоняем — возврата разницы нет.
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

  const subscription = await getActiveSubscription(user.id);
  const current = subscription ? await getPlanBySlug(subscription.planSlug) : null;
  const charge = checkoutCharge(plan, period, current);
  if (!charge.ok) {
    return NextResponse.json({ error: charge.error }, { status: 400 });
  }

  const autoRenew = Boolean(payload?.autoRenew) && period !== "lifetime";
  const description =
    charge.kind === "upgrade"
      ? `Повышение до «${plan.name}», доплата`
      : `blablablarden — ${plan.name}`;

  const started = await startYooKassaCheckout({
    request,
    user,
    kind: "subscription",
    amount: charge.amount,
    description,
    itemDescription: plan.name,
    returnPath: "/account",
    planSlug: plan.slug,
    period,
    savePaymentMethod: autoRenew,
    metadata: {
      autoRenew: autoRenew ? "1" : "0",
      planSlug: plan.slug,
      period,
      chargeKind: charge.kind,
    },
  });

  if (!started.ok) {
    return NextResponse.json({ error: started.error }, { status: started.status });
  }
  return NextResponse.json({
    paymentId: started.paymentId,
    confirmationUrl: started.confirmationUrl,
    amount: charge.amount,
    kind: charge.kind,
  });
}
