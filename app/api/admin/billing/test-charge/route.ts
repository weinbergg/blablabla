import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { startYooKassaCheckout } from "@/lib/payments/start-checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Админская проверка кассы: ровно 1 ₽, сразу СБП. Не включает подписку. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (user?.role !== "admin") {
    return NextResponse.json({ error: "Доступ только для админов" }, { status: 403 });
  }

  const started = await startYooKassaCheckout({
    request,
    user,
    kind: "donation",
    amount: 100,
    description: "Проверка кассы blablablarden, 1 ₽",
    itemDescription: "Проверка приёма оплаты",
    returnPath: "/account",
    paymentMethod: "sbp",
    skipStorefrontGate: true,
  });

  if (!started.ok) {
    return NextResponse.json({ error: started.error }, { status: started.status });
  }
  return NextResponse.json({
    paymentId: started.paymentId,
    confirmationUrl: started.confirmationUrl,
  });
}
