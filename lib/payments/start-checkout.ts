import "server-only";

import { randomUUID } from "crypto";
import { attachProviderPayment, createPaymentRecord } from "@/lib/db/billing";
import { getSiteConfig } from "@/lib/db/settings";
import { createPayment, getCredentials } from "@/lib/payments/yookassa";

type Kind = "subscription" | "seminar" | "campaign" | "donation";

export async function startYooKassaCheckout(options: {
  request: Request;
  user: { id: string; email: string };
  kind: Kind;
  amount: number;
  description: string;
  itemDescription: string;
  returnPath: string;
  targetId?: string | null;
  planSlug?: string | null;
  period?: string | null;
  metadata?: Record<string, string>;
}): Promise<{ ok: true; paymentId: string; confirmationUrl: string } | { ok: false; error: string; status: number }> {
  const config = await getSiteConfig();
  if (!config.paymentsEnabled) {
    return { ok: false, error: "Приём платежей пока выключен", status: 503 };
  }
  const credentials = getCredentials(config.yookassaMode);
  if (!credentials) {
    return { ok: false, error: "Платёжный модуль не настроен: нет ключей ЮKassa", status: 503 };
  }
  if (!options.amount || options.amount <= 0) {
    return { ok: false, error: "Некорректная сумма", status: 400 };
  }

  const idempotenceKey = randomUUID();
  const record = await createPaymentRecord({
    userId: options.user.id,
    kind: options.kind,
    amount: options.amount,
    planSlug: options.planSlug,
    period: options.period,
    targetId: options.targetId,
    description: options.description,
    idempotenceKey,
  });

  const origin = new URL(options.request.url).origin;
  const returnUrl = `${origin}${options.returnPath}${options.returnPath.includes("?") ? "&" : "?"}payment=${record.id}`;

  try {
    const payment = await createPayment({
      credentials,
      amount: options.amount,
      description: options.description,
      returnUrl,
      idempotenceKey,
      metadata: {
        paymentId: record.id,
        userId: options.user.id,
        kind: options.kind,
        ...(options.metadata ?? {}),
      },
      receipt: config.receiptsEnabled
        ? { customerEmail: options.user.email, itemDescription: options.itemDescription }
        : null,
    });
    await attachProviderPayment(record.id, payment.id, payment);
    const confirmationUrl = payment.confirmation?.confirmation_url;
    if (!confirmationUrl) {
      return { ok: false, error: "ЮKassa не вернула ссылку на оплату", status: 502 };
    }
    return { ok: true, paymentId: record.id, confirmationUrl };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Не удалось создать платёж",
      status: 502,
    };
  }
}
