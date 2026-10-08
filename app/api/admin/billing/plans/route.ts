import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPlans, updatePlan, type PlanPatch } from "@/lib/db/billing";
import { isFeatureKey, type FeatureKey } from "@/lib/entitlements";
import { rublesToKopeks } from "@/lib/money";

export const dynamic = "force-dynamic";

type Body = {
  id?: string;
  name?: string;
  tagline?: string | null;
  description?: string | null;
  /** Цены приходят из формы в рублях, в базе всегда копейки. */
  priceMonthlyRub?: number | null;
  priceYearlyRub?: number | null;
  priceLifetimeRub?: number | null;
  features?: string[];
  seatLimit?: number | null;
  active?: boolean;
  badge?: string | null;
  sortOrder?: number;
};

function numberOrNull(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (user?.role !== "admin") {
    return NextResponse.json({ error: "Доступ только для админов" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.id) {
    return NextResponse.json({ error: "Не указан тариф" }, { status: 400 });
  }

  const patch: PlanPatch = {};
  if (body.name !== undefined) patch.name = body.name.trim().slice(0, 120);
  if (body.tagline !== undefined) patch.tagline = body.tagline?.trim().slice(0, 200) || null;
  if (body.description !== undefined) patch.description = body.description?.trim().slice(0, 2000) || null;
  if (body.badge !== undefined) patch.badge = body.badge?.trim().slice(0, 40) || null;
  if (body.active !== undefined) patch.active = Boolean(body.active);
  if (body.sortOrder !== undefined && Number.isFinite(body.sortOrder)) patch.sortOrder = body.sortOrder;

  const monthly = numberOrNull(body.priceMonthlyRub);
  if (monthly !== undefined) patch.priceMonthly = rublesToKopeks(monthly ?? 0);
  const yearly = numberOrNull(body.priceYearlyRub);
  if (yearly !== undefined) patch.priceYearly = yearly === null ? null : rublesToKopeks(yearly);
  const lifetime = numberOrNull(body.priceLifetimeRub);
  if (lifetime !== undefined) patch.priceLifetime = lifetime === null ? null : rublesToKopeks(lifetime);

  const seats = numberOrNull(body.seatLimit);
  if (seats !== undefined) patch.seatLimit = seats === null ? null : Math.round(seats);

  if (Array.isArray(body.features)) {
    patch.features = body.features.filter((key): key is FeatureKey => isFeatureKey(key));
  }

  await updatePlan(body.id, patch);
  return NextResponse.json({ plans: await getPlans() });
}
