import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { sqlite } from "@/lib/db/client";
import { getFeatureFlags } from "@/lib/features";
import { FEATURES, type FeatureFlags } from "@/lib/feature-flags";

export async function GET() {
  if ((await getCurrentUser())?.role !== "admin") return NextResponse.json({ error: "Нужны права администратора" }, { status: 403 });
  return NextResponse.json(getFeatureFlags(), { headers: { "Cache-Control": "private, no-store" } });
}
export async function PUT(request: Request) {
  if ((await getCurrentUser())?.role !== "admin") return NextResponse.json({ error: "Нужны права администратора" }, { status: 403 });
  const input = await request.json().catch(() => null);
  if (!input?.modes || typeof input.modes !== "object" || Array.isArray(input.modes) || Object.keys(input.modes).length !== FEATURES.length ||
    FEATURES.some(f => !["on", "testers", "admins", "off"].includes(input.modes[f.id])) ||
    !Array.isArray(input.testerIds) || input.testerIds.length > 500 || input.testerIds.some((id: unknown) => typeof id !== "string" || id.length > 100)) {
    return NextResponse.json({ error: "Проверьте режимы разделов и список тестировщиков" }, { status: 400 });
  }
  const flags: FeatureFlags = { modes: input.modes, testerIds: [...new Set<string>(input.testerIds)] };
  const exists = sqlite.prepare("SELECT id FROM users WHERE id=?");
  if (flags.testerIds.some(id => !exists.get(id))) return NextResponse.json({ error: "Один из ID тестировщиков не найден. ID указан в ссылке на профиль." }, { status: 400 });
  sqlite.prepare("INSERT INTO site_settings(key,value) VALUES('feature_flags',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(flags));
  return NextResponse.json(flags);
}
