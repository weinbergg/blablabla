/**
 * Что кому доступно.
 *
 * Правило одно: код НИКОГДА не спрашивает «какой у человека тариф», он
 * спрашивает «есть ли у него фича X». Тарифы — это данные в таблице `plans`,
 * которые админ правит через админку; набор фич — константы здесь, потому
 * что под каждую фичу написан код.
 *
 * Файл не импортирует ничего серверного (базу, сессии), чтобы его можно было
 * использовать и в клиентских компонентах для отрисовки замочков.
 */

export const FEATURES = {
  "catalog.read": "Чтение книг онлайн",
  "download.single": "Скачивание книг по одной",
  "graph.view": "Граф связей",
  discuss: "Обсуждения и комментарии",
  shelves: "Личные полки, статусы и прогресс чтения",
  opds: "OPDS-каталог для читалок",
  "archive.zip": "Архив раздела одним файлом",
  "notes.export": "Экспорт заметок в Markdown",
  "search.fulltext": "Поиск по тексту внутри книг",
  "send.to_reader": "Отправка книги на почту читалки",
  "chat.private": "Закрытый чат читателей",
  "meeting.monthly": "Ежемесячная встреча «книга месяца»",
  "routes.guided": "Маршруты чтения с комментариями",
  "seminars.discount": "Скидка на семинары площадки",
  "requests.priority": "Заявка на оцифровку вне очереди",
  "credits.line": "Именная строка «Добавлено при поддержке»",
  "support.priority": "Приоритетная поддержка",
  "early.access": "Ранний доступ к новым функциям",
} as const;

export type FeatureKey = keyof typeof FEATURES;

export const FEATURE_KEYS = Object.keys(FEATURES) as FeatureKey[];

export function isFeatureKey(value: string): value is FeatureKey {
  return Object.prototype.hasOwnProperty.call(FEATURES, value);
}

export function featureLabel(key: string): string {
  return isFeatureKey(key) ? FEATURES[key] : key;
}

/** Базовый набор: доступен всем, включая гостей без подписки. */
export const FREE_FEATURES: FeatureKey[] = [
  "catalog.read",
  "download.single",
  "graph.view",
  "discuss",
];

export type PlanSeed = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  /** В копейках. */
  priceMonthly: number;
  priceYearly: number | null;
  priceLifetime: number | null;
  features: FeatureKey[];
  seatLimit: number | null;
  lifetime: boolean;
  accent: string;
  badge: string | null;
  active: boolean;
  sortOrder: number;
};

/**
 * Стартовые тарифы. Это именно «семена»: они записываются в базу один раз,
 * дальше истина — строки таблицы `plans`, которые редактирует админ.
 * Менять цену в коде после запуска не нужно, только в админке.
 */
export const PLAN_SEEDS: PlanSeed[] = [
  {
    slug: "free",
    name: "Свободный читатель",
    tagline: "Чтение и разговор",
    description:
      "Весь каталог доступен для чтения онлайн, книги скачиваются по одной, работают обсуждения и граф связей.",
    priceMonthly: 0,
    priceYearly: null,
    priceLifetime: null,
    features: FREE_FEATURES,
    seatLimit: null,
    lifetime: false,
    accent: "ink",
    badge: null,
    active: true,
    sortOrder: 0,
  },
  {
    slug: "reader",
    name: "Читательский билет",
    tagline: "Инструменты",
    description:
      "Библиотека на вашей читалке: OPDS, архивы разделов одним файлом, личные полки, экспорт заметок и поиск по тексту книг.",
    priceMonthly: 19900,
    priceYearly: 149000,
    priceLifetime: null,
    features: [
      ...FREE_FEATURES,
      "opds",
      "archive.zip",
      "shelves",
      "notes.export",
      "search.fulltext",
      "send.to_reader",
    ],
    seatLimit: null,
    lifetime: false,
    accent: "rust",
    badge: "Билет",
    active: true,
    sortOrder: 1,
  },
  {
    slug: "regular",
    name: "Завсегдатай",
    tagline: "Сообщество и кураторство",
    description:
      "Всё из читательского билета, закрытый чат, ежемесячная встреча «книга месяца» с гостем, маршруты чтения и скидка на семинары.",
    priceMonthly: 39900,
    priceYearly: 349000,
    priceLifetime: null,
    features: [
      ...FREE_FEATURES,
      "opds",
      "archive.zip",
      "shelves",
      "notes.export",
      "search.fulltext",
      "send.to_reader",
      "chat.private",
      "meeting.monthly",
      "routes.guided",
      "seminars.discount",
    ],
    seatLimit: null,
    lifetime: false,
    accent: "rust",
    badge: "Завсегдатай",
    active: true,
    sortOrder: 2,
  },
  {
    slug: "patron",
    name: "Попечитель",
    tagline: "Влияние на фонд",
    description:
      "Всё из «Завсегдатая», одна внеочередная заявка в месяц на добавление или оцифровку книги и именная строка на её странице.",
    priceMonthly: 99000,
    priceYearly: 899000,
    priceLifetime: null,
    features: [
      ...FREE_FEATURES,
      "opds",
      "archive.zip",
      "shelves",
      "notes.export",
      "search.fulltext",
      "send.to_reader",
      "chat.private",
      "meeting.monthly",
      "routes.guided",
      "seminars.discount",
      "requests.priority",
      "credits.line",
    ],
    seatLimit: null,
    lifetime: false,
    accent: "gold",
    badge: "Попечитель",
    active: true,
    sortOrder: 3,
  },
  {
    slug: "founder",
    name: "Основатель",
    tagline: "Ограниченный тираж",
    description:
      "Пожизненный доступ ко всему, что появится, приоритетная поддержка, имя на странице основателей и голос в выборе книг на оцифровку.",
    priceMonthly: 0,
    priceYearly: null,
    priceLifetime: 1500000,
    features: [...(Object.keys(FEATURES) as FeatureKey[])],
    seatLimit: 15,
    lifetime: true,
    // Выключен до тех пор, пока админ не подтвердит цену тиража.
    active: false,
    accent: "gold",
    badge: "Основатель",
    sortOrder: 4,
  },
];

/** Роли, которым доступно всё без подписки: они и так держат библиотеку. */
export function roleGrantsEverything(role: string | null | undefined) {
  return role === "admin" || role === "booster";
}

export type Entitlements = {
  planSlug: string;
  planName: string;
  badge: string | null;
  accent: string | null;
  features: FeatureKey[];
  /** null — не истекает (пожизненный тариф, админ, бесплатный уровень). */
  expiresAt: string | null;
  source: "role" | "subscription" | "free";
};

export function hasFeature(entitlements: Entitlements | null | undefined, feature: FeatureKey) {
  if (!entitlements) return FREE_FEATURES.includes(feature);
  return entitlements.features.includes(feature);
}
