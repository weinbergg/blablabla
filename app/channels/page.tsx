import { featureEnabled } from "@/lib/features";
import Link from "next/link";
import { Header } from "@/components/header";
import { ChannelCreateButton } from "@/components/channel-create-button";
import { UserAvatar } from "@/components/user-avatar";
import { getCurrentUser } from "@/lib/auth";
import { getEntitlements } from "@/lib/db/billing";
import { getChannelByOwner, listAuthorChannels } from "@/lib/db/channels";
import { hasFeature } from "@/lib/entitlements";
import { countLabel } from "@/lib/pluralize";

export const dynamic = "force-dynamic";

export default async function ChannelsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getCurrentUser();
  const { q = "" } = await searchParams;
  const [channels, entitlements, mine] = await Promise.all([
    listAuthorChannels(q),
    user ? getEntitlements(user) : Promise.resolve(null),
    user ? getChannelByOwner(user.id) : Promise.resolve(null),
  ]);
  const creationEnabled = await featureEnabled("channel_creation", user);
  const canOpen = creationEnabled && Boolean(user && entitlements && hasFeature(entitlements, "channels.publish"));

  return (
    <>
      <Header />
      <main className="shell py-12 md:py-16">
        <p className="eyebrow">Читатели</p>
        <h1 className="mt-3 font-serif text-4xl tracking-tight md:text-6xl">Голоса читателей</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-muted">
          Авторские заметки, литературные открытия и разговоры о прочитанном. Новые публикации собраны в{" "}
          <Link href="/news" className="underline underline-offset-2 hover:text-ink">
            новостях
          </Link>
          . Свой канал открывается с уровня «Завсегдатай».
        </p>

        <form className="mt-8 flex gap-2" action="/channels" method="get">
          <input
            name="q"
            defaultValue={q}
            placeholder="Поиск по каналам"
            className="flex-1 border border-ink/15 bg-paper px-3 py-2 text-sm"
          />
          <button type="submit" className="button-secondary">
            Найти
          </button>
        </form>

        <div className="mt-8">
          {mine ? (
            <Link href={`/channels/${mine.slug}`} className="button-primary">
              Мой канал
            </Link>
          ) : canOpen && user ? (
            <ChannelCreateButton defaultTitle={`Канал ${user.name}`} />
          ) : !creationEnabled ? <p className="text-sm text-muted">Новые каналы пока не открываются.</p> : (
            <p className="text-sm text-muted">
              Чтобы вести канал, нужен{" "}
              <Link href="/pricing" className="underline underline-offset-2 hover:text-ink">
                тариф Завсегдатай или выше
              </Link>
              .
            </p>
          )}
        </div>

        <ul className="mt-10 grid gap-x-10 md:grid-cols-2">
          {channels.length === 0 ? (
            <li className="rounded-2xl border border-dashed border-ink/15 px-5 py-10 text-sm text-muted">
              Пока никто не открыл канал.
            </li>
          ) : (
            channels.map((channel) => (
              <li key={channel.id}>
                <Link href={`/channels/${channel.slug}`} className="group block border-t border-ink/20 py-7 hover:text-ink">
                  <span className="block font-serif text-3xl leading-snug tracking-tight group-hover:text-rust">
                    {channel.title}
                  </span>
                  {channel.description ? (
                    <span className="mt-2 block text-sm leading-6 text-muted">{channel.description}</span>
                  ) : null}
                  <span className="mt-3 flex items-center gap-2.5 text-xs text-muted">
                    <UserAvatar
                      userId={channel.ownerId}
                      avatarKey={channel.ownerAvatarKey}
                      avatarColor={channel.ownerAvatarColor}
                      name={channel.ownerName}
                      size={28}
                    />
                    {channel.ownerName}
                    {" · "}
                    {countLabel(Number(channel.postCount) || 0, ["запись", "записи", "записей"])}
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
