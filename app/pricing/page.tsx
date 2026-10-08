import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/header";
import { PricingPlans, type PricingPlan } from "@/components/pricing-plans";
import { getCurrentUser } from "@/lib/auth";
import { getEntitlements, getPlans } from "@/lib/db/billing";
import { getSiteConfig } from "@/lib/db/settings";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Поддержка и доступ — blablablarden",
  description:
    "Чтение и обсуждение остаются бесплатными. Подписка оплачивает сервер, оцифровку и инструменты: OPDS, архивы разделов, полки, экспорт заметок.",
};

export default async function PricingPage() {
  const user = await getCurrentUser();
  const [plans, config, entitlements] = await Promise.all([
    getPlans({ onlyActive: true }),
    getSiteConfig(),
    getEntitlements(user),
  ]);

  const cards: PricingPlan[] = plans.map((plan) => ({
    slug: plan.slug,
    name: plan.name,
    tagline: plan.tagline,
    description: plan.description,
    priceMonthly: plan.priceMonthly,
    priceYearly: plan.priceYearly,
    priceLifetime: plan.priceLifetime,
    features: plan.features,
    seatLimit: plan.seatLimit,
    seatsTaken: plan.seatsTaken ?? 0,
    lifetime: plan.lifetime,
    badge: plan.badge,
  }));

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-5 pb-20 pt-8 md:px-8">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={15} />В библиотеку
        </Link>

        <header className="mb-10 max-w-2xl">
          <p className="eyebrow mb-2">Доступ и поддержка</p>
          <h1 className="font-serif text-4xl tracking-tight md:text-5xl">
            Библиотека открыта. Инструменты — по билету
          </h1>
          <p className="mt-4 text-base leading-7 text-muted">{config.pricingIntro}</p>
        </header>

        <PricingPlans
          plans={cards}
          currentPlanSlug={entitlements.source === "subscription" ? entitlements.planSlug : null}
          paymentsEnabled={config.paymentsEnabled}
          signedIn={Boolean(user)}
        />

        <section className="mt-16 grid gap-8 border-t border-ink/10 pt-10 md:grid-cols-3">
          <div>
            <h2 className="mb-2 font-serif text-xl tracking-tight">Что остаётся бесплатным</h2>
            <p className="text-sm leading-6 text-muted">
              Весь каталог читается онлайн без оплаты, книги скачиваются по одной, обсуждения
              и граф связей открыты всем. Подписка не закрывает тексты — она даёт инструменты
              вокруг них.
            </p>
          </div>
          <div>
            <h2 className="mb-2 font-serif text-xl tracking-tight">Куда идут деньги</h2>
            <p className="text-sm leading-6 text-muted">
              Сервер и хранилище сканов, оцифровка редких изданий, вычитка метаданных.
              Отчёт по сборам на оцифровку публикуется на странице самого сбора.
            </p>
          </div>
          <div>
            <h2 className="mb-2 font-serif text-xl tracking-tight">Оплата и возврат</h2>
            <p className="text-sm leading-6 text-muted">
              Оплата картой через ЮKassa.{" "}
              {config.legalName
                ? `Получатель — ${config.legalName}${config.legalInn ? `, ИНН ${config.legalInn}` : ""}.`
                : ""}{" "}
              Подписка не продлевается автоматически: доступ просто заканчивается в указанную дату.
              {config.supportEmail ? ` Вопросы по оплате — ${config.supportEmail}.` : ""}
            </p>
            {config.offerUrl && (
              <a
                href={config.offerUrl}
                className="mt-2 inline-block text-sm text-muted underline underline-offset-2 hover:text-ink"
              >
                Публичная оферта
              </a>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
