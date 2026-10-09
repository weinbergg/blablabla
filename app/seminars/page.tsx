import Link from "next/link";
import { Header } from "@/components/header";
import { listPublicSeminars } from "@/lib/db/events";
import { formatWhen } from "@/lib/db/channels";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function SeminarsPage() {
  const seminars = await listPublicSeminars();

  return (
    <>
      <Header />
      <main className="shell py-12 md:py-16">
        <p className="eyebrow mb-3">Встречи</p>
        <h1 className="font-serif text-4xl tracking-tight md:text-5xl">Семинары</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
          Платная запись на встречи площадки. Цена и число мест задаёт админ; у Завсегдатая и
          выше — скидка, если она включена для этой встречи.
        </p>
        <p className="mt-3 text-sm text-muted">
          Сборы на оцифровку книг —{" "}
          <Link href="/campaigns" className="underline underline-offset-2 hover:text-ink">
            отдельным списком
          </Link>
          .
        </p>

        <ul className="mt-12 space-y-3">
          {seminars.length === 0 ? (
            <li className="rounded-2xl border border-dashed border-ink/15 px-5 py-10 text-sm text-muted">
              Сейчас нет открытой записи. Когда появится встреча, она окажется здесь — без рекламных полос.
            </li>
          ) : (
            seminars.map((seminar) => (
              <li key={seminar.id}>
                <Link href={`/seminars/${seminar.slug}`} className="topic-card group hover:text-ink">
                  <span className="block font-serif text-xl leading-snug tracking-tight group-hover:text-rust">
                    {seminar.title}
                  </span>
                  {seminar.summary ? (
                    <span className="mt-2 block text-sm leading-6 text-muted">{seminar.summary}</span>
                  ) : null}
                  <span className="mt-3 block text-xs text-muted">
                    {seminar.startsAt ? formatWhen(seminar.startsAt) : "дата уточняется"}
                    {seminar.location ? ` · ${seminar.location}` : ""}
                    {` · ${formatMoney(seminar.priceKopeks)}`}
                    {seminar.seatLimit != null
                      ? ` · ${seminar.seatsTaken} из ${seminar.seatLimit} мест`
                      : ""}
                  </span>
                </Link>
              </li>
            ))
          )}
        </ul>
      </main>
    </>
  );
}
