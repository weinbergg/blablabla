import "server-only";

import { eq } from "drizzle-orm";
import { db } from "./client";
import { siteSettings } from "./schema";

/**
 * Настройки площадки, которые админ меняет без деплоя.
 *
 * Хранятся одной строкой site_settings('config') с JSON внутри: так весь
 * конфиг читается и пишется атомарно, а добавление нового поля не требует
 * миграции — достаточно дописать его в DEFAULT_SETTINGS.
 */
export type SiteConfig = {
  /** Главный рубильник: пока false, кнопки оплаты не показываются вообще. */
  paymentsEnabled: boolean;
  /** Боевой или тестовый магазин ЮKassa (ключи берутся из переменных окружения). */
  yookassaMode: "test" | "live";
  /** Самозанятый шлёт чеки через ЮKassa — выключается, если чеки оформляются иначе. */
  receiptsEnabled: boolean;

  /** Сколько файлов в сутки может скачать аккаунт без подписки. */
  downloadsPerDayFree: number;
  /** То же для подписчиков. */
  downloadsPerDayPaid: number;
  /** Потолок для неавторизованных (по IP) — защита от выкачивания фонда. */
  downloadsPerDayAnonymous: number;
  /** Книг в одном ZIP-архиве раздела. */
  zipMaxDocuments: number;
  /** Размер ZIP-архива в мегабайтах. */
  zipMaxMegabytes: number;

  /** Реквизиты для оферты и чеков. */
  legalName: string;
  legalInn: string;
  supportEmail: string;
  offerUrl: string;

  /** Текст над тарифами на странице подписки. */
  pricingIntro: string;
};

export const DEFAULT_SETTINGS: SiteConfig = {
  paymentsEnabled: false,
  yookassaMode: "test",
  receiptsEnabled: true,

  downloadsPerDayFree: 10,
  downloadsPerDayPaid: 200,
  downloadsPerDayAnonymous: 0,
  zipMaxDocuments: 150,
  zipMaxMegabytes: 2048,

  legalName: "",
  legalInn: "",
  supportEmail: "",
  offerUrl: "",

  pricingIntro:
    "Библиотека остаётся открытой: читать и обсуждать можно бесплатно. Подписка оплачивает сервер, оцифровку и инструменты для тех, кому библиотека нужна каждый день.",
};

const CONFIG_KEY = "config";

export async function getSiteConfig(): Promise<SiteConfig> {
  const [row] = await db
    .select({ value: siteSettings.value })
    .from(siteSettings)
    .where(eq(siteSettings.key, CONFIG_KEY))
    .limit(1);
  if (!row) return { ...DEFAULT_SETTINGS };
  try {
    const stored = JSON.parse(row.value) as Partial<SiteConfig>;
    // Слияние с умолчаниями: старая строка в базе не ломает новые поля.
    return { ...DEFAULT_SETTINGS, ...stored };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function updateSiteConfig(patch: Partial<SiteConfig>, userId: string | null) {
  const current = await getSiteConfig();
  const next: SiteConfig = { ...current, ...patch };
  const value = JSON.stringify(next);
  const updatedAt = new Date().toISOString();
  await db
    .insert(siteSettings)
    .values({ key: CONFIG_KEY, value, updatedBy: userId, updatedAt })
    .onConflictDoUpdate({
      target: siteSettings.key,
      set: { value, updatedBy: userId, updatedAt },
    });
  return next;
}
