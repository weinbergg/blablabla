import { NextResponse } from "next/server";
import { runBillingTick } from "@/lib/payments/billing-tick";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : new URL(request.url).searchParams.get("secret");
  return token === secret;
}

/** Вызывается с VPS раз в день (cron). Напоминания и автоплатежи. */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const summary = await runBillingTick();
  return NextResponse.json(summary);
}

export async function POST(request: Request) {
  return GET(request);
}
