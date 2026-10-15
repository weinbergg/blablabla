"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { featureLabel, featureLadder, type FeatureKey } from "@/lib/entitlements";
import { formatMoney } from "@/lib/money";
import { checkoutCharge, type ChargePlan } from "@/lib/plan-charge";

export type PricingPlan = ChargePlan & {
  name: string;
  tagline: string | null;
  description: string | null;
  features: FeatureKey[];
  seatLimit: number | null;
  seatsTaken: number;
  badge: string | null;
};

type Period = "month" | "year";

export function PricingPlans({
  plans,
  currentPlanSlug,
  paymentsEnabled,
  signedIn,
}: {
  plans: PricingPlan[];
  currentPlanSlug: string | null;
  paymentsEnabled: boolean;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>("year");
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [ask, setAsk] = useState<PricingPlan | null>(null);

  const anyYearly = plans.some((plan) => plan.priceYearly);
  const ladder = featureLadder(plans);
  const current = plans.find((plan) => plan.slug === currentPlanSlug) ?? null;

  function priceFor(plan: PricingPlan) {
    if (plan.lifetime) return plan.priceLifetime ?? 0;
    return period === "year" ? (plan.priceYearly ?? plan.priceMonthly * 12) : plan.priceMonthly;
  }

  function priceNote(plan: PricingPlan) {
    if (plan.lifetime) return "один раз, навсегда";
    if (period === "year") {
      const monthly = Math.round((plan.priceYearly ?? plan.priceMonthly * 12) / 12);
      return plan.priceMonthly > 0 ? `в год · ${formatMoney(monthly)} в месяц` : "в год";
    }
    return "в месяц";
  }

  function chargeFor(plan: PricingPlan) {
    return checkoutCharge(plan, plan.lifetime ? "lifetime" : period, current);
  }

  async function subscribe(plan: PricingPlan, autoRenew: boolean) {
    setError("");
    setAsk(null);
    if (!signedIn) {
      router.push(`/login?next=${encodeURIComponent("/pricing")}`);
      return;
    }
    setBusySlug(plan.slug);
    const response = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planSlug: plan.slug,
        period: plan.lifetime ? "lifetime" : period,
        autoRenew: plan.lifetime ? false : autoRenew,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      confirmationUrl?: string;
      error?: string;
    };
    setBusySlug(null);
    if (!response.ok || !data.confirmationUrl) {
      setError(data.error || "Не удалось начать оплату. Попробуйте позже.");
      return;
    }
    window.location.href = data.confirmationUrl;
  }

  return (
    <div>
      {anyYearly && (
        <div className="mb-8 flex justify-center">
          <div className="inline-flex rounded-full border border-ink/12 p-0.5 text-sm">
            {(
              [
                ["month", "Помесячно"],
                ["year", "На год"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setPeriod(key)}
                className={`rounded-full px-4 py-1.5 transition-colors ${
                  period === key ? "bg-ink text-paper" : "text-muted hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => {
          const free = plan.priceMonthly === 0 && !plan.lifetime;
          const isCurrent = currentPlanSlug === plan.slug;
          const soldOut = plan.seatLimit != null && plan.seatsTaken >= plan.seatLimit;
          const layer = ladder.get(plan.slug);
          const charge = chargeFor(plan);
          const isDowngrade = Boolean(current && !isCurrent && !free && !charge.ok);
          return (
            <section
              key={plan.slug}
              className={`flex flex-col rounded-2xl border p-6 ${
                isCurrent ? "border-rust/50 bg-rust/[0.04]" : "border-ink/10"
              }`}
            >
              <div className="mb-4">
                <p className="eyebrow mb-1.5">{plan.tagline}</p>
                <h2 className="font-serif text-2xl tracking-tight">{plan.name}</h2>
              </div>

              <div className="mb-4">
                <p className="font-serif text-3xl tracking-tight">
                  {free ? "Бесплатно" : formatMoney(priceFor(plan))}
                </p>
                {!free && <p className="mt-0.5 text-xs text-muted">{priceNote(plan)}</p>}
                {charge.ok && charge.kind === "upgrade" && (
                  <p className="mt-1 text-xs text-rust">доплата {formatMoney(charge.amount)}</p>
                )}
              </div>

              {plan.seatLimit != null && (
                <p className="mb-4 font-mono text-[11px] uppercase tracking-widest text-rust">
                  {soldOut
                    ? "мест не осталось"
                    : `осталось ${plan.seatLimit - plan.seatsTaken} из ${plan.seatLimit}`}
                </p>
              )}

              <ul className="mb-6 space-y-2 text-sm">
                {layer?.inheritedName && (
                  <li className="flex gap-2 leading-5 text-muted">
                    <Check size={15} className="mt-0.5 shrink-0 text-ink/40" />
                    <span>Всё из предыдущей</span>
                  </li>
                )}
                {(layer?.extra ?? plan.features).map((feature) => (
                  <li key={feature} className="flex gap-2 leading-5">
                    <Check size={15} className="mt-0.5 shrink-0 text-rust" />
                    <span>{featureLabel(feature)}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto">
                {isCurrent ? (
                  <p className="rounded-xl border border-ink/10 px-3 py-2 text-center text-sm text-muted">
                    Ваш текущий уровень
                  </p>
                ) : free ? (
                  <p className="text-center text-sm text-muted">Доступно всем без оплаты</p>
                ) : !paymentsEnabled ? (
                  <p className="rounded-xl border border-dashed border-ink/15 px-3 py-2 text-center text-sm text-muted">
                    Оплата скоро откроется
                  </p>
                ) : soldOut ? (
                  <p className="rounded-xl border border-ink/10 px-3 py-2 text-center text-sm text-muted">
                    Тираж разобран
                  </p>
                ) : isDowngrade ? (
                  <p className="rounded-xl border border-ink/10 px-3 py-2 text-center text-xs leading-5 text-muted">
                    Понижение не компенсируем. Сменить можно, когда закончится оплаченный срок.
                  </p>
                ) : (
                  <button
                    type="button"
                    className="button-primary w-full justify-center"
                    disabled={busySlug === plan.slug}
                    onClick={() => {
                      if (!signedIn) {
                        router.push(`/login?next=${encodeURIComponent("/pricing")}`);
                        return;
                      }
                      setAsk(plan);
                    }}
                  >
                    {busySlug === plan.slug ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        Открываю оплату…
                      </>
                    ) : charge.ok && charge.kind === "upgrade" ? (
                      `Доплатить ${formatMoney(charge.amount)}`
                    ) : (
                      "Оформить"
                    )}
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <p className="mt-8 text-center text-sm leading-6 text-muted">
        Тариф всегда можно сменить в кабинете. Повышение — доплата разницы за тот же период.
        Понижение не возвращаем: доступ текущего уровня просто доживает до даты.
      </p>

      {error && <p className="mt-4 text-center text-sm text-rust">{error}</p>}

      {ask && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-ink/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="renew-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-ink/10 bg-paper p-6 shadow-lg">
            <p className="eyebrow mb-2">Оплата</p>
            <h3 id="renew-title" className="font-serif text-2xl tracking-tight">
              {ask.name}
            </h3>
            {(() => {
              const charge = chargeFor(ask);
              return (
                <p className="mt-3 text-sm leading-6 text-muted">
                  {charge.ok
                    ? charge.kind === "upgrade"
                      ? `К оплате ${formatMoney(charge.amount)} — разница с текущим уровнем.`
                      : `К оплате ${formatMoney(charge.amount)}.`
                    : charge.error}{" "}
                  Продлевать автоматически? По оферте это отдельно: без согласия доступ кончится в
                  оплаченную дату. Включить и выключить потом можно в кабинете.
                </p>
              );
            })()}
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                className="button-secondary flex-1 justify-center"
                disabled={Boolean(busySlug)}
                onClick={() => void subscribe(ask, false)}
              >
                Без продления
              </button>
              <button
                type="button"
                className="button-primary flex-1 justify-center"
                disabled={Boolean(busySlug)}
                onClick={() => void subscribe(ask, true)}
              >
                С автопродлением
              </button>
            </div>
            <button
              type="button"
              className="mt-3 w-full text-center text-sm text-muted underline-offset-2 hover:text-ink hover:underline"
              onClick={() => setAsk(null)}
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
