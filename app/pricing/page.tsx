import { featureEnabled } from "@/lib/features";
import { PageView } from "@/components/page-view";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/header";
import { SiteFooter } from "@/components/site-footer";
import { PricingPlans, type PricingPlan } from "@/components/pricing-plans";
import { getCurrentUser } from "@/lib/auth";
import { getEntitlements, getPlans, hasUsedTrial } from "@/lib/db/billing";
import { getSiteConfig } from "@/lib/db/settings";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Поддержка и доступ — blablablarden",
  description:
    "Чтение и обсуждение остаются бесплатными. Подписка оплачивает сервер, оцифровку и инструменты: OPDS, архивы разделов, полки, экспорт заметок.",
};

export default async function PricingPage() {
  const user = await getCurrentUser();
  const hostsEnabled = await featureEnabled("host_programs", user);
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
    priceWeekly: plan.priceWeekly,
        features: plan.features,
    seatLimit: plan.seatLimit,
    seatsTaken: plan.seatsTaken ?? 0,
    lifetime: plan.lifetime,
    badge: plan.badge,
    sortOrder: plan.sortOrder,
  }));

  return (
    <>
      <PageView section="pricing" />
      <Header />
      <main className="mx-auto max-w-[1240px] px-5 pb-20 pt-8 md:px-8">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={15} />В библиотеку
        </Link>

        <header className="mb-10 max-w-2xl">
          <p className="eyebrow mb-2">Доступ и поддержка</p>
          <h1 className="display">
            Библиотека открыта. Инструменты — по билету
          </h1>
          <p className="mt-4 text-base leading-7 text-muted">{config.pricingIntro}</p>
        </header>

        <nav className="mb-7 flex flex-wrap gap-5 border-b border-ink/15 pb-4 text-sm"><a href="#tickets" className="text-rust">Читательские билеты</a>{hostsEnabled && <a href="#programmes" className="text-muted hover:text-rust">Программы ведущих</a>}</nav>
        <section id="tickets" className="scroll-mt-24"><h2 className="mb-5 font-serif text-3xl">Читательские билеты</h2><PricingPlans
          plans={cards}
          currentPlanSlug={entitlements.source === "subscription" ? entitlements.planSlug : null}
          paymentsEnabled={config.paymentsEnabled}
          signedIn={Boolean(user)}
          trialUsed={user ? await hasUsedTrial(user.email, user.id) : false}
        />

        </section>
        {hostsEnabled && <section id="programmes" className="mt-14 grid scroll-mt-24 gap-8 border-y border-ink/20 py-9 sm:grid-cols-[1fr_14rem]"><div><p className="eyebrow">Отдельный формат участия</p><h2 className="mt-3 font-serif text-3xl">Программы ведущих</h2><p className="mt-4 max-w-2xl text-sm leading-7 text-muted">Регулярные совместные чтения, семинары и занятия с ведущим. Билет даёт инструменты библиотеки; участие в программе организатора оформляется отдельно.</p><Link href="/hosts" className="mt-5 inline-block text-sm text-rust">Условия для ведущих и калькулятор →</Link></div><div><p className="font-serif text-4xl">399 ₽ <span className="text-lg text-muted">/ месяц</span></p><p className="mt-3 text-xs leading-6 text-muted">Предварительная стоимость программы. Приём оплаты пока не активирован.</p><Link href="/seminars" className="button-secondary mt-5">Выбрать чтение</Link></div></section>}
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
              Оплата картой или СБП через ЮKassa.{" "}
              {config.legalName
                ? `Получатель — ${config.legalName}${config.legalInn ? `, ИНН ${config.legalInn}` : ""}.`
                : ""}{" "}
              Автопродление спрашиваем перед оплатой; в кабинете его можно включить или выключить.
              Сменить тариф — там же: повышение доплатой разницы, понижение без возврата.
              {config.supportEmail ? ` Вопросы по оплате — ${config.supportEmail}.` : ""}
            </p>
            <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <Link href={config.offerUrl || "/offer"} className="text-muted underline underline-offset-2 hover:text-ink">
                Публичная оферта
              </Link>
              <Link href="/privacy" className="text-muted underline underline-offset-2 hover:text-ink">
                Политика данных
              </Link>
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
