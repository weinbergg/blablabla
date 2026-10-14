import Link from "next/link";
import { headers } from "next/headers";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ReaderKeys } from "@/components/reader-keys";
import { AccountForm } from "@/components/account-form";
import { AccountSubscription } from "@/components/account-subscription";
import { Header } from "@/components/header";
import { PaymentReturnSync } from "@/components/payment-return-sync";
import { SiteFooter } from "@/components/site-footer";
import { getCurrentUser } from "@/lib/auth";
import { getEntitlements, listPayments } from "@/lib/db/billing";
import { formatWhen, getChannelByOwner } from "@/lib/db/channels";
import { listTicketsForUser } from "@/lib/db/events";
import { hasFeature } from "@/lib/entitlements";
import { formatMoney } from "@/lib/money";
import { ROLE_LABELS, type UserRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

const PAYMENT_STATUS: Record<string, string> = {
  pending: "ожидает оплаты",
  waiting_for_capture: "подтверждается",
  succeeded: "оплачен",
  canceled: "отменён",
  refunded: "возвращён",
};

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const entitlements = await getEntitlements(user);
  const payments = (await listPayments(50)).filter((payment) => payment.userId === user.id).slice(0, 8);
  const ownChannel = await getChannelByOwner(user.id);
  const tickets = await listTicketsForUser(user.id);
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") || headerList.get("host") || "localhost:3130";
  const proto = headerList.get("x-forwarded-proto") || "http";
  const origin = `${proto}://${host}`;

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-5 py-10 md:px-8">
        <Suspense>
          <PaymentReturnSync />
        </Suspense>

        <p className="eyebrow mb-3">
          {ROLE_LABELS[user.role as UserRole] ?? user.role} · {user.name}
        </p>
        <h1 className="font-serif text-4xl tracking-tight md:text-5xl">Кабинет</h1>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <AccountSubscription
            planName={entitlements.planName}
            source={entitlements.source}
            expiresAt={entitlements.expiresAt}
            autoRenew={entitlements.autoRenew}
            hasSavedMethod={entitlements.hasSavedMethod}
            period={entitlements.period}
          />

          <section className="rounded-3xl border border-ink/10 bg-white/50 p-8 shadow-[0_24px_80px_rgba(25,31,40,0.08)] backdrop-blur dark:bg-white/5 dark:shadow-none md:p-10">
            <p className="eyebrow mb-3">Профиль</p>
            <h2 className="font-serif text-2xl tracking-tight">Знак, почта, пароль</h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              Знак и цвет сохраняются сразу. Текущий пароль нужен только если меняете почту или пароль.
            </p>
            <AccountForm
              email={user.email}
              userId={user.id}
              avatarKey={user.avatarKey}
              avatarColor={user.avatarColor}
            />
            <Link
              href={`/users/${user.id}`}
              className="mt-6 block text-center text-sm text-muted underline underline-offset-2 hover:text-ink"
            >
              Публичный профиль
            </Link>
          </section>
        </div>

        {(payments.length > 0 || tickets.length > 0 || ownChannel || hasFeature(entitlements, "channels.publish")) && (
          <section className="mt-6 rounded-3xl border border-ink/10 p-8 md:p-10">
            {payments.length > 0 && (
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">Платежи</p>
                <ul className="space-y-2 text-sm text-muted">
                  {payments.map((payment) => (
                    <li key={payment.id} className="flex justify-between gap-3">
                      <span className="truncate">
                        {new Date(payment.createdAt).toLocaleDateString("ru-RU")} ·{" "}
                        {payment.description || payment.kind}
                      </span>
                      <span className="shrink-0 font-mono">
                        {formatMoney(payment.amount)} · {PAYMENT_STATUS[payment.status] ?? payment.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {tickets.length > 0 && (
              <div className={payments.length > 0 ? "mt-6 border-t border-ink/10 pt-5" : ""}>
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">Встречи</p>
                <ul className="space-y-1 text-sm">
                  {tickets.map((ticket) => (
                    <li key={ticket.id}>
                      <Link href={`/seminars/${ticket.slug}`} className="underline-offset-2 hover:underline">
                        {ticket.title}
                      </Link>
                      <span className="text-xs text-muted">
                        {ticket.startsAt ? ` · ${formatWhen(ticket.startsAt)}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {hasFeature(entitlements, "opds") && (
              <div className={payments.length > 0 || tickets.length > 0 ? "mt-6 border-t border-ink/10 pt-5" : ""}>
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">Читалки и OPDS</p>
                <ReaderKeys origin={origin} />
              </div>
            )}

            {ownChannel ? (
              <Link href={`/channels/${ownChannel.slug}`} className="button-secondary mt-6 w-full justify-center">
                Мой канал
              </Link>
            ) : hasFeature(entitlements, "channels.publish") ? (
              <Link href="/channels" className="button-secondary mt-6 w-full justify-center">
                Открыть свой канал
              </Link>
            ) : null}
          </section>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
