import "server-only";

import { NextResponse } from "next/server";
import { getEntitlements } from "@/lib/db/billing";
import { shelfLimitReached } from "@/lib/db/library";
import { getSiteConfig } from "@/lib/db/settings";
import { hasFeature } from "@/lib/entitlements";

/**
 * Полка как платный инструмент.
 *
 * С правом `shelves` полка безразмерная. Без него работает бесплатная квота
 * из настроек: столько книг человек может вести и без подписки, дальше —
 * предложение оформить читательский билет. Квоту админ меняет в админке, в
 * том числе может поставить 0 и закрыть полку совсем.
 *
 * Возвращает готовый ответ, если добавлять нельзя, и null, если можно.
 */
export async function shelfBlocked(
  user: { id: string; role: string },
  documentId: string,
): Promise<NextResponse | null> {
  const [entitlements, config] = await Promise.all([getEntitlements(user), getSiteConfig()]);
  if (hasFeature(entitlements, "shelves")) return null;

  const reached = await shelfLimitReached(user.id, documentId, config.shelfFreeLimit);
  if (!reached) return null;

  return NextResponse.json(
    {
      error:
        config.shelfFreeLimit === 0
          ? "Личная полка входит в читательский билет."
          : `Бесплатно на полке помещается ${config.shelfFreeLimit} книг. Снимите что-нибудь или оформите читательский билет — тогда полка станет безразмерной.`,
      upgrade: "/pricing",
    },
    { status: 402 },
  );
}
