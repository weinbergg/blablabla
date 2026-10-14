import Link from "next/link";
import type { Entitlements } from "@/lib/entitlements";

export function SubscriptionNotice({ entitlements }: { entitlements: Entitlements | null }) {
  if (!entitlements?.expiresAt || entitlements.source !== "subscription") return null;
  const left = (new Date(entitlements.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
  const windowDays = entitlements.period === "year" ? 7 : 3;
  if (left > windowDays || left < -1) return null;
  const until = new Date(entitlements.expiresAt).toLocaleDateString("ru-RU");
  return (
    <p className="border-b border-ink/10 bg-rust/[0.06] px-5 py-2 text-center text-sm text-ink">
      {entitlements.autoRenew
        ? `Автопродление тарифа «${entitlements.planName}» — около ${until}. `
        : `«${entitlements.planName}» действует до ${until}. `}
      <Link href="/account" className="underline underline-offset-2">
        Кабинет
      </Link>
    </p>
  );
}
