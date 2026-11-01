/** Preliminary spreadsheet assumptions only; never used by checkout or payout code. */
export const HOST_PRICE_RUBLES = 399;
export function estimateHostIncome(participants: number, model: "standard" | "start") {
  const count = Math.max(0, Math.min(10000, Math.trunc(Number.isFinite(participants) ? participants : 0)));
  const turnover = count * HOST_PRICE_RUBLES;
  // Keep the unrounded base until the final amount: 20 × 369.075 = 7,381.50.
  const fee = turnover * 0.035, assumedTax = turnover * 0.04, base = turnover - fee - assumedTax;
  const hostShare = model === "start" ? 0.7 : 0.6;
  return { count, turnover, fee, assumedTax, base, host: base * hostShare, platform: base * (1 - hostShare), hostShare };
}
