import { eq, like, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { cancelSubscription, grantSubscription, listSubscriptions } from "@/lib/db/billing";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/**
 * Ручная выдача подписки: нужна для основателей, оплат мимо кассы и подарков.
 * Принимает либо userId, либо почту/ник — админу так удобнее.
 */
export async function POST(request: Request) {
  const admin = await getCurrentUser();
  if (admin?.role !== "admin") {
    return NextResponse.json({ error: "Доступ только для админов" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: "grant" | "cancel";
    subscriptionId?: string;
    user?: string;
    planSlug?: string;
    period?: "month" | "year" | "lifetime";
    note?: string;
  };

  if (body.action === "cancel") {
    if (!body.subscriptionId) {
      return NextResponse.json({ error: "Не указана подписка" }, { status: 400 });
    }
    await cancelSubscription(body.subscriptionId);
    return NextResponse.json({ subscriptions: await listSubscriptions(200) });
  }

  const query = body.user?.trim();
  if (!query || !body.planSlug) {
    return NextResponse.json({ error: "Нужны пользователь и тариф" }, { status: 400 });
  }

  const [found] = await db
    .select({ id: users.id })
    .from(users)
    .where(or(eq(users.id, query), eq(users.email, query), like(users.name, query)))
    .limit(1);
  if (!found) {
    return NextResponse.json({ error: `Пользователь «${query}» не найден` }, { status: 404 });
  }

  try {
    await grantSubscription({
      userId: found.id,
      planSlug: body.planSlug,
      period: body.period ?? "month",
      source: "manual",
      note: body.note?.slice(0, 500) ?? `Выдал ${admin.name}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось выдать подписку";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ subscriptions: await listSubscriptions(200) });
}
