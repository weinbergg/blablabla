import "server-only";

import { NextResponse } from "next/server";
import { countDownloadsLastDay } from "@/lib/db/billing";
import type { SiteConfig } from "@/lib/db/settings";
import type { Entitlements } from "@/lib/entitlements";

const BURST_WINDOW_MS = 10 * 60 * 1000;
const BURST_UNITS = 12;

/**
 * Лимит выдачи файлов. Чтение онлайн не трогаем.
 *
 * Дыра, которую уже, похоже, использовали: ZIP раздела писался как одно
 * событие, и суточный лимит (10/200) не видел сотни книг внутри. Теперь
 * ZIP считается по числу файлов. Плюс потолок на IP (много аккаунтов с
 * одного адреса) и короткий «взрыв» — 12 файлов за 10 минут.
 */
export async function remainingDownloadUnits(options: {
  userId: string;
  ip: string | null;
  entitlements: Entitlements;
  config: SiteConfig;
}) {
  const userLimit =
    options.entitlements.source === "free"
      ? options.config.downloadsPerDayFree
      : options.config.downloadsPerDayPaid;
  if (userLimit === 0) return Number.POSITIVE_INFINITY;

  const [usedUser, usedIp, burstUser] = await Promise.all([
    countDownloadsLastDay({ userId: options.userId }),
    options.ip ? countDownloadsLastDay({ ip: options.ip }) : 0,
    countDownloadsLastDay({ userId: options.userId, sinceMs: BURST_WINDOW_MS }),
  ]);

  const ipLimit = Math.min(options.config.downloadsPerDayPaid, Math.max(30, userLimit * 3));
  const byUser = Math.max(0, userLimit - usedUser);
  const byIp = Math.max(0, ipLimit - usedIp);
  const byBurst = Math.max(0, BURST_UNITS - burstUser);
  return Math.min(byUser, byIp, byBurst);
}

export async function assertDownloadUnits(options: {
  userId: string;
  ip: string | null;
  entitlements: Entitlements;
  config: SiteConfig;
  units?: number;
}): Promise<{ ok: true; remaining: number } | { ok: false; response: NextResponse }> {
  const remaining = await remainingDownloadUnits(options);
  const need = options.units ?? 1;
  if (remaining >= need) return { ok: true, remaining };
  return {
    ok: false,
    response: NextResponse.json(
      {
        error:
          remaining <= 0
            ? "Слишком много скачиваний за короткое время или за сутки. Лимит нужен, чтобы фонд не выкачивали целиком. Читать онлайн по-прежнему можно."
            : `В архив сейчас поместится не больше ${remaining} книг — суточный лимит почти исчерпан.`,
        remaining,
      },
      { status: 429 },
    ),
  };
}
