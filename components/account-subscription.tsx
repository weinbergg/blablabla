"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export function AccountSubscription({
  planName,
  source,
  expiresAt,
  autoRenew,
  hasSavedMethod,
  period,
}: {
  planName: string;
  source: "role" | "subscription" | "free";
  expiresAt: string | null;
  autoRenew: boolean;
  hasSavedMethod: boolean;
  period: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [renew, setRenew] = useState(autoRenew);

  const until = expiresAt ? new Date(expiresAt).toLocaleDateString("ru-RU") : null;

  async function post(body: Record<string, unknown>) {
    setError("");
    setBusy(body.unlink ? "unlink" : "toggle");
    const response = await fetch("/api/billing/auto-renew", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string; autoRenew?: boolean };
    setBusy(null);
    if (!response.ok) {
      setError(data.error || "Не получилось изменить автопродление.");
      return;
    }
    if (typeof data.autoRenew === "boolean") setRenew(data.autoRenew);
    router.refresh();
  }

  return (
    <section className="rounded-3xl border border-ink/10 p-8 md:p-10">
      <p className="eyebrow mb-3">Доступ</p>
      <h2 className="font-serif text-3xl tracking-tight">{planName}</h2>
      <p className="mt-3 text-sm leading-6 text-muted">
        {source === "role"
          ? "Служебная роль: все инструменты библиотеки открыты."
          : source === "subscription"
            ? until
              ? `Оплачено до ${until}.${renew ? " Дальше спишем сами, если карта привязана." : " Сами не продлеваем — можно включить ниже или оплатить снова."}`
              : "Бессрочный доступ."
            : "Чтение, скачивание по одной книге, обсуждения и граф связей — без оплаты. Билет нужен для OPDS, архивов, полок и заметок."}
      </p>

      {source === "subscription" && period !== "lifetime" && (
        <div className="mt-6 space-y-3 border-t border-ink/10 pt-5">
          <p className="text-sm leading-6">
            Автопродление:{" "}
            <span className="font-medium">{renew ? "включено" : "выключено"}</span>
          </p>
          <p className="text-xs leading-5 text-muted">
            {hasSavedMethod
              ? "Можно выключить в любой момент: доступ доживёт до оплаченной даты."
              : "Чтобы включить, при следующей оплате выберите «С автопродлением». СБП ЮKassa часто не привязывает карту."}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={renew ? "button-secondary" : "button-primary"}
              disabled={busy !== null || (!hasSavedMethod && !renew)}
              onClick={() => void post({ enabled: !renew })}
            >
              {busy === "toggle" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : renew ? (
                "Выключить автопродление"
              ) : (
                "Включить автопродление"
              )}
            </button>
            {hasSavedMethod && (
              <button
                type="button"
                className="button-secondary"
                disabled={busy !== null}
                onClick={() => void post({ unlink: true })}
              >
                {busy === "unlink" ? <Loader2 size={14} className="animate-spin" /> : "Отвязать карту"}
              </button>
            )}
          </div>
          {error && <p className="text-sm text-rust">{error}</p>}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link href="/pricing" className="button-primary justify-center sm:flex-1">
          {source === "subscription" ? "Сменить уровень" : "Оформить билет"}
        </Link>
        <Link href="/" className="button-secondary justify-center sm:flex-1">
          В библиотеку
        </Link>
      </div>
    </section>
  );
}
