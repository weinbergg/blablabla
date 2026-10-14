import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getActiveSubscription, setSubscriptionAutoRenew } from "@/lib/db/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    enabled?: boolean;
    unlink?: boolean;
  } | null;

  const subscription = await getActiveSubscription(user.id);
  if (!subscription) {
    return NextResponse.json({ error: "Нет активной подписки" }, { status: 404 });
  }
  if (subscription.period === "lifetime") {
    return NextResponse.json({ error: "Пожизненный доступ не продлевается" }, { status: 400 });
  }

  if (body?.unlink) {
    await setSubscriptionAutoRenew(subscription.id, false, { paymentMethodId: null });
    return NextResponse.json({ autoRenew: false, hasSavedMethod: false });
  }

  const enabled = Boolean(body?.enabled);
  if (enabled && !subscription.paymentMethodId) {
    return NextResponse.json(
      {
        error:
          "Способ оплаты не сохранён. Отметьте автопродление при следующей оплате картой — СБП ЮKassa часто не привязывает.",
      },
      { status: 400 },
    );
  }
  await setSubscriptionAutoRenew(subscription.id, enabled);
  return NextResponse.json({ autoRenew: enabled, hasSavedMethod: Boolean(subscription.paymentMethodId) });
}
