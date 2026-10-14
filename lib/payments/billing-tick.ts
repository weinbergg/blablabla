import "server-only";

import { eq } from "drizzle-orm";
import {
  attachProviderPayment,
  createPaymentRecord,
  getPaymentByIdempotenceKey,
  getPlanBySlug,
  listSubscriptionsForTick,
  setSubscriptionAutoRenew,
} from "@/lib/db/billing";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { getSiteConfig } from "@/lib/db/settings";
import { settleYooKassaPayment } from "@/lib/payments/fulfill";
import { createPayment, getCredentials } from "@/lib/payments/yookassa";

function daysUntil(iso: string | null) {
  if (!iso) return Infinity;
  return (new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
}

async function userEmail(userId: string) {
  const [row] = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row;
}

async function maybeMail(to: string, subject: string, _text: string) {
  // Письма подключим отдельно. `import("nodemailer")` ронял `next build`,
  // потому что пакета нет в dependencies. Напоминание пока живёт баннером в шапке.
  if (!process.env.SMTP_HOST) return { sent: false as const, reason: "no_smtp" };
  console.info("[billing-tick] SMTP задан, но отправитель ещё не подключён", to, subject);
  return { sent: false as const, reason: "smtp_not_wired" };
}

/**
 * Час/сутки: напомнить об окончании, списать автоплатёж, повторить неудачное
 * списание в течение 3 дней (оферта 5.5–5.6).
 */
export async function runBillingTick() {
  const config = await getSiteConfig();
  const credentials = getCredentials(config.yookassaMode);
  const rows = await listSubscriptionsForTick();
  const origin = process.env.PUBLIC_URL || "https://blablablarden.ru";
  const summary = { reminded: 0, charged: 0, failed: 0, skipped: 0 };

  for (const row of rows) {
    if (!row.expiresAt || row.period === "lifetime") continue;
    const left = daysUntil(row.expiresAt);
    const remindAfter = row.period === "year" ? 7 : 1;

    if (left <= remindAfter && left > 0 && !row.remindedAt) {
      const owner = await userEmail(row.userId);
      const plan = await getPlanBySlug(row.planSlug);
      const text = row.autoRenew
        ? `Здравствуйте${owner?.name ? `, ${owner.name}` : ""}.\n\nСкоро спишем оплату тарифа «${plan?.name ?? row.planSlug}». Отключить автопродление: ${origin}/account\n\nblablablarden`
        : `Здравствуйте${owner?.name ? `, ${owner.name}` : ""}.\n\nДоступ «${plan?.name ?? row.planSlug}» заканчивается ${new Date(row.expiresAt).toLocaleDateString("ru-RU")}. Продлить: ${origin}/pricing\n\nblablablarden`;
      if (owner?.email) {
        await maybeMail(
          owner.email,
          row.autoRenew ? "Скоро спишем оплату подписки" : "Подписка скоро закончится",
          text,
        );
      }
      await setSubscriptionAutoRenew(row.id, Boolean(row.autoRenew), { remindedAt: new Date().toISOString() });
      summary.reminded += 1;
    }

    const due = left <= 0;
    const inGrace = left > -3;
    if (!due || !inGrace) continue;
    if (!row.autoRenew || !row.paymentMethodId || !credentials) {
      summary.skipped += 1;
      continue;
    }

    const plan = await getPlanBySlug(row.planSlug);
    const amount =
      row.period === "year" ? plan?.priceYearly : row.period === "lifetime" ? plan?.priceLifetime : plan?.priceMonthly;
    if (!plan || !amount) {
      summary.skipped += 1;
      continue;
    }

    const owner = await userEmail(row.userId);
    const idempotenceKey = `renew:${row.id}:${row.expiresAt}`;
    try {
      const existing = await getPaymentByIdempotenceKey(idempotenceKey);
      const record =
        existing ??
        (await createPaymentRecord({
          userId: row.userId,
          kind: "subscription",
          amount,
          planSlug: row.planSlug,
          period: row.period,
          description: `Автопродление: ${plan.name}`,
          idempotenceKey,
        }));
      if (record.status === "succeeded") {
        summary.charged += 1;
        continue;
      }
      const payment = await createPayment({
        credentials,
        amount,
        description: `blablablarden — ${plan.name} (автопродление)`,
        returnUrl: `${origin}/account?payment=${record.id}`,
        idempotenceKey,
        paymentMethodId: row.paymentMethodId,
        metadata: {
          paymentId: record.id,
          userId: row.userId,
          kind: "subscription",
          autoRenew: "1",
          planSlug: row.planSlug,
          period: row.period,
        },
        receipt:
          config.receiptsEnabled && owner?.email
            ? { customerEmail: owner.email, itemDescription: plan.name }
            : null,
      });
      await attachProviderPayment(record.id, payment.id, payment);
      const settled = await settleYooKassaPayment(record, payment);
      if (settled.ok && settled.status === "succeeded") summary.charged += 1;
      else summary.failed += 1;
    } catch {
      summary.failed += 1;
    }
  }

  return summary;
}
