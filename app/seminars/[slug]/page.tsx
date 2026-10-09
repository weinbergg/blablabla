import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/header";
import { ChannelPostBody } from "@/components/channel-post-body";
import { EventPayButton } from "@/components/event-pay-button";
import { getCurrentUser } from "@/lib/auth";
import { getEntitlements } from "@/lib/db/billing";
import { formatWhen } from "@/lib/db/channels";
import { getSeminarBySlug, getTicket, seminarPriceFor } from "@/lib/db/events";
import { getSiteConfig } from "@/lib/db/settings";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function SeminarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const seminar = await getSeminarBySlug(slug);
  if (!seminar || seminar.status === "draft") notFound();

  const user = await getCurrentUser();
  const [entitlements, config, ticket] = await Promise.all([
    getEntitlements(user),
    getSiteConfig(),
    user ? getTicket(seminar.id, user.id) : Promise.resolve(null),
  ]);
  const price = seminarPriceFor(seminar, entitlements);
  const discounted = price < seminar.priceKopeks;
  const full = seminar.seatLimit != null && seminar.seatsTaken >= seminar.seatLimit;

  let disabledReason: string | null = null;
  if (ticket) disabledReason = "Вы уже записаны на эту встречу.";
  else if (seminar.status !== "open") disabledReason = "Запись закрыта.";
  else if (full) disabledReason = "Мест больше нет.";

  return (
    <>
      <Header />
      <main className="shell py-12 md:py-16">
        <Link
          href="/seminars"
          className="mb-8 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={15} />
          Все встречи
        </Link>
        <article className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="max-w-2xl">
            <p className="eyebrow mb-3">Семинар</p>
            <h1 className="font-serif text-4xl tracking-tight">{seminar.title}</h1>
            <p className="mt-3 text-sm text-muted">
              {seminar.startsAt ? formatWhen(seminar.startsAt) : "дата уточняется"}
              {seminar.location ? ` · ${seminar.location}` : ""}
            </p>
            {seminar.body ? (
              <div className="mt-8">
                <ChannelPostBody text={seminar.body} />
              </div>
            ) : seminar.summary ? (
              <p className="mt-8 text-base leading-7 text-muted">{seminar.summary}</p>
            ) : null}
          </div>
          <aside className="rounded-2xl border border-ink/10 p-5">
            <p className="font-serif text-2xl tracking-tight">
              {formatMoney(price)}
              {discounted ? (
                <span className="ml-2 text-sm font-sans text-muted line-through">
                  {formatMoney(seminar.priceKopeks)}
                </span>
              ) : null}
            </p>
            {discounted ? (
              <p className="mt-1 text-xs text-muted">Скидка по тарифу Завсегдатай и выше.</p>
            ) : null}
            {seminar.seatLimit != null ? (
              <p className="mt-3 text-sm text-muted">
                {seminar.seatsTaken} из {seminar.seatLimit} мест
              </p>
            ) : null}
            <div className="mt-5">
              <EventPayButton
                kind="seminar"
                targetId={seminar.id}
                amount={price}
                label="Записаться"
                signedIn={Boolean(user)}
                paymentsEnabled={config.paymentsEnabled}
                disabledReason={disabledReason}
              />
            </div>
          </aside>
        </article>
      </main>
    </>
  );
}
