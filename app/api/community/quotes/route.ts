import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { featureDenied } from "@/lib/features";
import { sqlite } from "@/lib/db/client";
import { savedQuotes } from "@/lib/saved-quotes";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Войдите, чтобы выбрать свою пометку" }, { status: 401 });
  const denied = await featureDenied("channels", user); if (denied) return denied;
  const raw = Number(new URL(request.url).searchParams.get("page") || 1);
  const page = Number.isInteger(raw) && raw > 0 ? Math.min(raw, 10000) : 1;
  return NextResponse.json(savedQuotes(sqlite, user.id, page), { headers: { "Cache-Control": "private, no-store" } });
}
