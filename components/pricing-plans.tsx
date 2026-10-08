"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { featureLabel, type FeatureKey } from "@/lib/entitlements";
import { formatMoney } from "@/lib/money";

export type PricingPlan = {
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  priceMonthly: number;
  priceYearly: number | null;
  priceLifetime: number | null;
  features: FeatureKey[];
  seatLimit: number | null;
  seatsTaken: number;
  lifetime: boolean;
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

  const anyYearly = plans.some((plan) => plan.priceYearly);

  async function subscribe(plan: PricingPlan) {
    setError("");
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

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => {
          const free = plan.priceMonthly === 0 && !plan.lifetime;
          const current = currentPlanSlug === plan.slug;
          const soldOut = plan.seatLimit != null && plan.seatsTaken >= plan.seatLimit;
          return (
            <section
              key={plan.slug}
              className={`flex flex-col rounded-2xl border p-6 ${
                current ? "border-rust/50 bg-rust/[0.04]" : "border-ink/10"
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
              </div>

              {plan.description && (
                <p className="mb-5 text-sm leading-6 text-muted">{plan.description}</p>
              )}

              {plan.seatLimit != null && (
                <p className="mb-4 font-mono text-[11px] uppercase tracking-widest text-rust">
                  {soldOut
                    ? "мест не осталось"
                    : `осталось ${plan.seatLimit - plan.seatsTaken} из ${plan.seatLimit}`}
                </p>
              )}

              <ul className="mb-6 space-y-2 text-sm">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2 leading-5">
                    <Check size={15} className="mt-0.5 shrink-0 text-rust" />
                    <span>{featureLabel(feature)}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto">
                {current ? (
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
                ) : (
                  <button
                    type="button"
                    className="button-primary w-full justify-center"
                    disabled={busySlug === plan.slug}
                    onClick={() => subscribe(plan)}
                  >
                    {busySlug === plan.slug ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        Открываю оплату…
                      </>
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

      {error && <p className="mt-6 text-center text-sm text-rust">{error}</p>}
    </div>
  );
}
