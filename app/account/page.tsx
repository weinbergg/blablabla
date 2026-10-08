import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { redirect } from "next/navigation";
import { AccountForm } from "@/components/account-form";
import { getCurrentUser } from "@/lib/auth";
import { getEntitlements, listPayments } from "@/lib/db/billing";
import { featureLabel } from "@/lib/entitlements";
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

  return (
    <main className="grid min-h-screen place-items-center px-5 py-12">
      <div className="w-full max-w-xl">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={15} />
          Вернуться в библиотеку
        </Link>
        <section className="rounded-3xl border border-ink/10 bg-white/50 p-8 shadow-[0_24px_80px_rgba(25,31,40,0.08)] backdrop-blur dark:bg-white/5 dark:shadow-none md:p-10">
          <span className="grid size-11 place-items-center rounded-full bg-ink font-serif text-2xl italic text-paper">
            b.
          </span>
          <p className="eyebrow mb-3 mt-8">
            {ROLE_LABELS[user.role as UserRole] ?? user.role} · {user.name}
          </p>
          <h1 className="font-serif text-4xl tracking-tight">Настройки аккаунта</h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            Знак и цвет сохраняются сразу. Текущий пароль нужен только если меняете
            почту (логин) или пароль.
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
            Посмотреть свой публичный профиль
          </Link>
        </section>

        <section className="mt-6 rounded-3xl border border-ink/10 p-8 md:p-10">
          <p className="eyebrow mb-3">Доступ</p>
          <h2 className="font-serif text-2xl tracking-tight">{entitlements.planName}</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            {entitlements.source === "role"
              ? "Служебная роль: доступны все инструменты библиотеки."
              : entitlements.source === "subscription"
                ? `Подписка активна${
                    entitlements.expiresAt
                      ? ` до ${new Date(entitlements.expiresAt).toLocaleDateString("ru-RU")}`
                      : " бессрочно"
                  }. Автопродления нет — доступ просто закончится в эту дату.`
                : "Чтение, скачивание по одной книге, обсуждения и граф связей доступны без оплаты."}
          </p>

          <ul className="mt-5 space-y-1.5 text-sm">
            {entitlements.features.map((feature) => (
              <li key={feature} className="flex gap-2 leading-5 text-muted">
                <Check size={14} className="mt-0.5 shrink-0 text-rust" />
                {featureLabel(feature)}
              </li>
            ))}
          </ul>

          {payments.length > 0 && (
            <div className="mt-6 border-t border-ink/10 pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">
                Платежи
              </p>
              <ul className="space-y-1 text-xs text-muted">
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

          <Link href="/pricing" className="button-secondary mt-6 w-full justify-center">
            {entitlements.source === "subscription" ? "Сменить уровень" : "Что даёт подписка"}
          </Link>
        </section>
      </div>
    </main>
  );
}
