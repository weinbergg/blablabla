import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getActivityOverview } from "@/lib/db/activity-stats";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (user?.role !== "admin") {
    return NextResponse.json({ error: "Только админ" }, { status: 403 });
  }
  const days = Number(new URL(request.url).searchParams.get("days") ?? "14");
  const overview = await getActivityOverview(Number.isFinite(days) ? Math.min(90, Math.max(1, days)) : 14);
  return NextResponse.json(overview);
}
