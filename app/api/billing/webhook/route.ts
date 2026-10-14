import { NextResponse } from "next/server";
import { loadLocalPayment, settleYooKassaPayment } from "@/lib/payments/fulfill";
import { getSiteConfig } from "@/lib/db/settings";
import { clientIpFrom } from "@/lib/file-access";
import { fetchPayment, getCredentials, isNotificationIp } from "@/lib/payments/yookassa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Вебхук ЮKassa. Два правила безопасности:
 *   1. запрос принимается только с IP самой ЮKassa;
 *   2. телу запроса мы не верим — статус платежа перечитывается через API по
 *      его id. Иначе любой, кто узнает адрес вебхука, выпишет себе подписку.
 *
 * Отвечаем 200 даже на «чужой» платёж: ЮKassa считает не-200 сбоем и будет
 * повторять уведомление сутки.
 */
export async function POST(request: Request) {
  const ip = clientIpFrom(request.headers);
  if (process.env.NODE_ENV === "production" && !isNotificationIp(ip)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    event?: string;
    object?: { id?: string };
  } | null;
  const providerPaymentId = body?.object?.id;
  if (!providerPaymentId) return NextResponse.json({ ok: true });

  const config = await getSiteConfig();
  const credentials = getCredentials(config.yookassaMode);
  if (!credentials) return NextResponse.json({ ok: true });

  const remote = await fetchPayment(credentials, providerPaymentId);
  if (!remote) return NextResponse.json({ ok: true });

  const local = await loadLocalPayment({ providerPaymentId });
  if (!local) return NextResponse.json({ ok: true });

  await settleYooKassaPayment(local, remote);
  return NextResponse.json({ ok: true });
}
