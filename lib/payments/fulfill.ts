import "server-only";

import {
  getPaymentById,
  getPaymentByProviderId,
  grantSubscription,
  setPaymentStatus,
  type PaymentRow,
} from "@/lib/db/billing";
import { applyCampaignPayment, grantSeminarTicket } from "@/lib/db/events";
import { getSiteConfig } from "@/lib/db/settings";
import { fetchPayment, getCredentials, type YooKassaPayment } from "@/lib/payments/yookassa";

/**
 * Один раз разбираем ответ ЮKassa и включаем доступ.
 * Вебхук и возврат с оплаты ходят сюда: телу уведомления не верим,
 * статус всегда перечитывается через API.
 */
export async function settleYooKassaPayment(local: PaymentRow, remote: YooKassaPayment) {
  if (local.status === "succeeded") return { ok: true as const, status: local.status };

  if (remote.status === "canceled") {
    await setPaymentStatus(local.id, "canceled", remote);
    return { ok: true as const, status: "canceled" as const };
  }

  if (remote.status !== "succeeded" || !remote.paid) {
    const status = remote.status === "waiting_for_capture" ? "waiting_for_capture" : "pending";
    await setPaymentStatus(local.id, status, remote);
    return { ok: true as const, status };
  }

  const expected = (local.amount / 100).toFixed(2);
  if (remote.amount?.value !== expected) {
    await setPaymentStatus(local.id, "pending", remote);
    return { ok: false as const, error: "Сумма в ЮKassa не совпала с нашей записью" };
  }

  await setPaymentStatus(local.id, "succeeded", remote);

  if (local.kind === "subscription" && local.userId && local.planSlug) {
    const period = local.period === "year" ? "year" : local.period === "lifetime" ? "lifetime" : "month";
    const wantsRenew = remote.metadata?.autoRenew === "1";
    const savedId = remote.payment_method?.saved ? remote.payment_method.id : null;
    await grantSubscription({
      userId: local.userId,
      planSlug: local.planSlug,
      period,
      source: "yookassa",
      note: `Платёж ${remote.id}`,
      autoRenew: Boolean(wantsRenew && savedId),
      paymentMethodId: savedId ?? null,
    });
  }

  if (local.kind === "seminar" && local.userId && local.targetId) {
    await grantSeminarTicket({
      seminarId: local.targetId,
      userId: local.userId,
      paymentId: local.id,
      source: "yookassa",
    });
  }

  if (local.kind === "campaign" && local.targetId) {
    await applyCampaignPayment(local.targetId);
  }

  return { ok: true as const, status: "succeeded" as const };
}

export async function syncPaymentFromYooKassa(local: PaymentRow) {
  if (!local.providerPaymentId) {
    return { ok: false as const, error: "Платёж ещё не ушёл в ЮKassa" };
  }
  const config = await getSiteConfig();
  const credentials = getCredentials(config.yookassaMode);
  if (!credentials) return { ok: false as const, error: "Нет ключей ЮKassa" };
  const remote = await fetchPayment(credentials, local.providerPaymentId);
  if (!remote) return { ok: false as const, error: "ЮKassa не нашла этот платёж" };
  return settleYooKassaPayment(local, remote);
}

export async function loadLocalPayment(options: { id?: string | null; providerPaymentId?: string | null }) {
  if (options.providerPaymentId) return getPaymentByProviderId(options.providerPaymentId);
  if (options.id) return getPaymentById(options.id);
  return null;
}
