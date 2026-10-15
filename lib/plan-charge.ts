/**
 * Сколько взять при оформлении тарифа. Понижение не продаём и не возмещаем:
 * человек просто дожидается конца оплаченного срока. Повышение — разница
 * прайса за тот же период (месяц к месяцу, год к году).
 */

export type ChargePlan = {
  slug: string;
  sortOrder: number;
  priceMonthly: number;
  priceYearly: number | null;
  priceLifetime: number | null;
  lifetime: boolean;
};

export function listPrice(plan: ChargePlan, period: "month" | "year" | "lifetime") {
  if (period === "lifetime" || plan.lifetime) return plan.priceLifetime ?? 0;
  if (period === "year") return plan.priceYearly ?? plan.priceMonthly * 12;
  return plan.priceMonthly;
}

export function checkoutCharge(
  target: ChargePlan,
  period: "month" | "year" | "lifetime",
  current: ChargePlan | null,
): { ok: true; amount: number; kind: "full" | "upgrade" } | { ok: false; error: string } {
  const full = listPrice(target, period);
  if (!full || full <= 0) return { ok: false, error: "Для этого тарифа нет такой оплаты" };

  if (!current || current.slug === "free" || current.sortOrder <= 0) {
    return { ok: true, amount: full, kind: "full" };
  }
  if (current.slug === target.slug) {
    return { ok: false, error: "Это уже ваш текущий уровень" };
  }
  if (target.sortOrder <= current.sortOrder) {
    return {
      ok: false,
      error: "Понижение не компенсируем. Более скромный тариф станет доступен, когда закончится оплаченный срок.",
    };
  }

  const currentPrice = listPrice(current, period);
  const amount = Math.max(0, full - currentPrice);
  if (!amount) return { ok: false, error: "Доплачивать нечего — цены совпадают" };
  return { ok: true, amount, kind: "upgrade" };
}
