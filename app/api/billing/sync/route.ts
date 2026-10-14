import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { loadLocalPayment, syncPaymentFromYooKassa } from "@/lib/payments/fulfill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** После возврата с оплаты: вебхук до localhost не доходит, поэтому
 * перечитываем статус сами. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { paymentId?: string } | null;
  const paymentId = body?.paymentId?.trim();
  if (!paymentId) return NextResponse.json({ error: "Не указан платёж" }, { status: 400 });

  const local = await loadLocalPayment({ id: paymentId });
  if (!local) return NextResponse.json({ error: "Платёж не найден" }, { status: 404 });
  if (local.userId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Это чужой платёж" }, { status: 403 });
  }

  const result = await syncPaymentFromYooKassa(local);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ status: result.status });
}
