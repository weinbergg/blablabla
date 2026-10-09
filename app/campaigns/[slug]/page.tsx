import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/header";
import { CampaignDonateForm } from "@/components/event-pay-button";
import { CampaignProgress } from "@/components/campaign-progress";
import { ChannelPostBody } from "@/components/channel-post-body";
import { getCurrentUser } from "@/lib/auth";
import { getCampaignBySlug, listCampaignThanks } from "@/lib/db/events";
import { getSiteConfig } from "@/lib/db/settings";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function CampaignPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const campaign = await getCampaignBySlug(slug);
  if (!campaign || campaign.status === "draft") notFound();

  const user = await getCurrentUser();
  const config = await getSiteConfig();
  const thanks = campaign.status === "funded" ? await listCampaignThanks(campaign.id) : [];

  return (
    <>
      <Header />
      <main className="shell py-12 md:py-16">
        <Link
          href="/campaigns"
          className="mb-8 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={15} />
          Все сборы
        </Link>
        <article className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="max-w-2xl">
            {campaign.status === "funded" ? (
              <p className="mb-3 text-[10px] uppercase tracking-[0.2em] text-rust">Сбор закрыт</p>
            ) : (
              <p className="eyebrow mb-3">Оцифровка</p>
            )}
            <h1 className="font-serif text-4xl tracking-tight">{campaign.title}</h1>
            {campaign.documentId && campaign.documentTitle ? (
              <p className="mt-3 text-sm">
                Книга:{" "}
                <Link
                  href={`/documents/${campaign.documentId}`}
                  className="underline underline-offset-2 hover:text-rust"
                >
                  {campaign.documentTitle}
                </Link>
              </p>
            ) : null}
            {campaign.body ? (
              <div className="mt-8">
                <ChannelPostBody text={campaign.body} />
              </div>
            ) : campaign.summary ? (
              <p className="mt-8 text-base leading-7 text-muted">{campaign.summary}</p>
            ) : null}

            {thanks.length > 0 && (
              <section className="mt-12 border-t border-ink/10 pt-8">
                <p className="eyebrow mb-3">Благодарности</p>
                <h2 className="font-serif text-2xl tracking-tight">Добавлено при поддержке</h2>
                <ul className="mt-5 space-y-2 text-sm">
                  {thanks.map((person) => (
                    <li key={person.userId ?? person.name} className="flex justify-between gap-3">
                      {person.userId ? (
                        <Link href={`/users/${person.userId}`} className="hover:text-rust">
                          {person.name}
                        </Link>
                      ) : (
                        <span>{person.name}</span>
                      )}
                      <span className="shrink-0 font-mono text-xs text-muted">{formatMoney(person.amount)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
          <aside className="rounded-2xl border border-ink/10 p-5">
            <CampaignProgress
              raised={campaign.raisedKopeks}
              goal={campaign.goalKopeks}
              backerCount={campaign.backerCount}
            />
            <div className="mt-6">
              {campaign.status === "open" ? (
                <CampaignDonateForm
                  campaignId={campaign.id}
                  signedIn={Boolean(user)}
                  paymentsEnabled={config.paymentsEnabled}
                />
              ) : (
                <p className="text-sm leading-6 text-muted">Взносы больше не принимаются.</p>
              )}
            </div>
          </aside>
        </article>
      </main>
    </>
  );
}
