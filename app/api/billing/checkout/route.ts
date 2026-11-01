import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isBillingPeriod } from "@/lib/billing-period";
import { getActiveSubscription, getPlanBySlug, hasUsedTrial } from "@/lib/db/billing";
import { clientIpFrom } from "@/lib/file-access";
import { logActivity } from "@/lib/activity";
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
    period?: string;
    autoRenew?: boolean;
  } | null;

  const planSlug = payload?.planSlug?.trim();
  const period = payload?.period ?? "month";
  if (!planSlug || !isBillingPeriod(period)) {
    return NextResponse.json({ error: "Не указан тариф" }, { status: 400 });
  }

  const plan = await getPlanBySlug(planSlug);
  if (!plan || !plan.active) {
    return NextResponse.json({ error: "Тариф недоступен" }, { status: 404 });
  }
  if (plan.slug === "trial") {
    if (period !== "week") {
      return NextResponse.json({ error: "Недельный билет оформляется только на семь дней" }, { status: 400 });
    }
    if (await hasUsedTrial(user.email, user.id)) {
      return NextResponse.json(
        { error: "Недельный билет на эту почту уже оформляли — повторно нельзя." },
        { status: 409 },
      );
    }
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

  const autoRenew = Boolean(payload?.autoRenew) && period !== "lifetime" && plan.slug !== "trial";
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
  logActivity({
    userId: user.id,
    email: user.email,
    action: "checkout",
    targetType: "plan",
    targetId: plan.slug,
    meta: { period, amount: charge.amount },
    ip: clientIpFrom(request.headers),
  });
  return NextResponse.json({
    paymentId: started.paymentId,
    confirmationUrl: started.confirmationUrl,
    amount: charge.amount,
    kind: charge.kind,
  });
}
