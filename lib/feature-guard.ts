import "server-only";

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { countDownloadsLastDay, getEntitlements } from "@/lib/db/billing";
import { getSiteConfig } from "@/lib/db/settings";
import { hasFeature, type Entitlements, type FeatureKey } from "@/lib/entitlements";
import type { SiteConfig } from "@/lib/db/settings";

/**
 * Одна проверка на все платные маршруты: кто пришёл, что ему можно и не
 * упёрся ли он в суточный лимит выгрузки.
 *
 * Ответы намеренно текстовые и по-русски: их видит живой человек в браузере
 * или читалке, а не только фронтенд.
 */

export type GuardedRequest = {
  user: { id: string; name: string; email: string; role: string };
  entitlements: Entitlements;
  config: SiteConfig;
  /** Сколько выгрузок осталось на сегодня. */
  remaining: number;
};

type Result = { ok: true; context: GuardedRequest } | { ok: false; response: NextResponse };

export async function requireFeature(feature: FeatureKey): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Нужно войти в библиотеку" }, { status: 401 }),
    };
  }

  const [entitlements, config] = await Promise.all([getEntitlements(user), getSiteConfig()]);
  if (!hasFeature(entitlements, feature)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Эта возможность входит в читательский билет", upgrade: "/pricing" },
        { status: 402 },
      ),
    };
  }

  const limit = entitlements.source === "free" ? config.downloadsPerDayFree : config.downloadsPerDayPaid;
  const used = await countDownloadsLastDay({ userId: user.id });
  // 0 в настройках означает «без лимита» — так же это трактует /api/files.
  if (limit === 0) {
    return {
      ok: true,
      context: { user, entitlements, config, remaining: Number.POSITIVE_INFINITY },
    };
  }

  return {
    ok: true,
    context: { user, entitlements, config, remaining: Math.max(0, limit - used) },
  };
}

/** Отдельная проверка лимита — вызывается там, где выгрузка реально начнётся. */
export function overDailyLimit(context: GuardedRequest) {
  if (context.remaining > 0) return null;
  return NextResponse.json(
    {
      error:
        "На сегодня лимит выгрузки исчерпан. Он нужен, чтобы фонд не выкачивали роботами — завтра счётчик обнулится.",
    },
    { status: 429 },
  );
}
