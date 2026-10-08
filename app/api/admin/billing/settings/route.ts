import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { updateSiteConfig, type SiteConfig } from "@/lib/db/settings";

export const dynamic = "force-dynamic";

const BOOLEAN_KEYS = ["paymentsEnabled", "receiptsEnabled"] as const;
const NUMBER_KEYS = [
  "downloadsPerDayFree",
  "downloadsPerDayPaid",
  "shelfFreeLimit",
  "zipMaxDocuments",
  "zipMaxMegabytes",
] as const;
const TEXT_KEYS = ["legalName", "legalInn", "supportEmail", "offerUrl", "pricingIntro"] as const;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (user?.role !== "admin") {
    return NextResponse.json({ error: "Доступ только для админов" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Partial<SiteConfig> = {};

  for (const key of BOOLEAN_KEYS) {
    if (key in body) patch[key] = Boolean(body[key]);
  }
  for (const key of NUMBER_KEYS) {
    if (!(key in body)) continue;
    const parsed = Number(body[key]);
    if (Number.isFinite(parsed) && parsed >= 0) patch[key] = Math.round(parsed);
  }
  for (const key of TEXT_KEYS) {
    if (!(key in body)) continue;
    patch[key] = String(body[key] ?? "").slice(0, 2000);
  }
  if (body.yookassaMode === "test" || body.yookassaMode === "live") {
    patch.yookassaMode = body.yookassaMode;
  }

  const config = await updateSiteConfig(patch, user.id);
  return NextResponse.json({ config });
}
