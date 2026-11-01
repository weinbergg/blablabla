export const BILLING_PERIODS = ["week", "month", "year", "lifetime"] as const;
export type BillingPeriod = (typeof BILLING_PERIODS)[number];

export function isBillingPeriod(value: string | null | undefined): value is BillingPeriod {
  return Boolean(value && (BILLING_PERIODS as readonly string[]).includes(value));
}
