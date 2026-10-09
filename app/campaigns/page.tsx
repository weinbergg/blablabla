import Link from "next/link";
import { Header } from "@/components/header";
import { CampaignProgress } from "@/components/campaign-progress";
import { listPublicCampaigns } from "@/lib/db/events";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const campaigns = await listPublicCampaigns();

  return (
    <>
      <Header />
      <main className="shell py-12 md:py-16">
        <p className="eyebrow mb-3">Фонд</p>
        <h1 className="font-serif text-4xl tracking-tight md:text-5xl">Сборы на оцифровку</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
          Деньги идут на конкретную книгу или корпус. Когда цель закрыта, имена поддержавших
          остаются на странице сбора — без баннеров и без скрытых взносов.
        </p>
        <p className="mt-3 text-sm text-muted">
          Платные встречи — в{" "}
          <Link href="/seminars" className="underline underline-offset-2 hover:text-ink">
            семинарах
          </Link>
          .
        </p>

        <ul className="mt-12 space-y-8">
          {campaigns.length === 0 ? (
            <li className="rounded-2xl border border-dashed border-ink/15 px-5 py-10 text-sm text-muted">
              Сейчас нет открытого сбора.
            </li>
          ) : (
            campaigns.map((campaign) => (
              <li key={campaign.id} className="rounded-2xl border border-ink/10 p-5 md:p-6">
                <Link href={`/campaigns/${campaign.slug}`} className="group block">
                  {campaign.status === "funded" ? (
                    <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-rust">Сбор закрыт</p>
                  ) : null}
                  <h2 className="font-serif text-2xl tracking-tight group-hover:text-rust">{campaign.title}</h2>
                  {campaign.summary ? (
                    <p className="mt-2 text-sm leading-6 text-muted">{campaign.summary}</p>
                  ) : null}
                </Link>
                <div className="mt-5">
                  <CampaignProgress
                    raised={campaign.raisedKopeks}
                    goal={campaign.goalKopeks}
                    backerCount={campaign.backerCount}
                  />
                </div>
              </li>
            ))
          )}
        </ul>
      </main>
    </>
  );
}
