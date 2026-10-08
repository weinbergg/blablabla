/**
 * Деньги в проекте живут в копейках и только в целых числах.
 *
 * Почему: 0.1 + 0.2 в JavaScript даёт 0.30000000000000004, и такие ошибки
 * накапливаются в суммах сборов и отчётах. В базе — копейки (integer), на
 * экране — рубли, в ЮKassa — строка вида "199.00".
 */

export function rublesToKopeks(rubles: number | string): number {
  const value = typeof rubles === "string" ? Number(rubles.replace(",", ".")) : rubles;
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 100);
}

export function kopeksToRubles(kopeks: number): number {
  return Math.round(kopeks) / 100;
}

/** "199 ₽", "1 490 ₽", "99,50 ₽" — без копеек, когда их нет. */
export function formatMoney(kopeks: number | null | undefined): string {
  if (kopeks == null) return "—";
  const rubles = kopeksToRubles(kopeks);
  const formatted = new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: kopeks % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(rubles);
  return `${formatted} ₽`;
}

/** Формат, который требует ЮKassa: строка с двумя знаками после точки. */
export function toProviderAmount(kopeks: number): string {
  return (Math.round(kopeks) / 100).toFixed(2);
}
