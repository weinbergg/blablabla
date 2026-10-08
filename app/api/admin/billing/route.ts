import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPlans, listPayments, listSubscriptions } from "@/lib/db/billing";
import { getSiteConfig } from "@/lib/db/settings";
import { FEATURE_KEYS, featureLabel } from "@/lib/entitlements";
import { credentialsConfigured } from "@/lib/payments/yookassa";

export const dynamic = "force-dynamic";

/** Всё состояние вкладки «Монетизация» одним запросом. */
export async function GET() {
  const user = await getCurrentUser();
  if (user?.role !== "admin") {
    return NextResponse.json({ error: "Доступ только для админов" }, { status: 403 });
  }

  const [plans, config, subscriptions, payments] = await Promise.all([
    getPlans(),
    getSiteConfig(),
    listSubscriptions(200),
    listPayments(100),
  ]);

  return NextResponse.json({
    plans,
    config,
    subscriptions,
    payments,
    features: FEATURE_KEYS.map((key) => ({ key, label: featureLabel(key) })),
    providerReady: {
      test: credentialsConfigured("test"),
      live: credentialsConfigured("live"),
    },
  });
}
