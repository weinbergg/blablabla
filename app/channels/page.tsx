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

export default async function ChannelsPage() {
  const user = await getCurrentUser();
  const [channels, entitlements, mine] = await Promise.all([
    listAuthorChannels(),
    user ? getEntitlements(user) : Promise.resolve(null),
    user ? getChannelByOwner(user.id) : Promise.resolve(null),
  ]);
  const canOpen = Boolean(user && entitlements && hasFeature(entitlements, "channels.publish"));

  return (
    <>
      <Header />
      <main className="shell py-12 md:py-16">
        <p className="eyebrow mb-3">Читатели</p>
        <h1 className="font-serif text-4xl tracking-tight md:text-5xl">Каналы</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
          Длинные записи со ссылками на книги — не чат. Хроника самой библиотеки живёт в{" "}
          <Link href="/news" className="underline underline-offset-2 hover:text-ink">
            новостях
          </Link>
          . Свой канал открывается с уровня «Завсегдатай».
        </p>

        <div className="mt-8">
          {mine ? (
            <Link href={`/channels/${mine.slug}`} className="button-primary">
              Мой канал
            </Link>
          ) : canOpen && user ? (
            <ChannelCreateButton defaultTitle={`Канал ${user.name}`} />
          ) : (
            <p className="text-sm text-muted">
              Чтобы вести канал, нужен{" "}
              <Link href="/pricing" className="underline underline-offset-2 hover:text-ink">
                тариф Завсегдатай или выше
              </Link>
              .
            </p>
          )}
        </div>

        <ul className="mt-12 space-y-3">
          {channels.length === 0 ? (
            <li className="rounded-2xl border border-dashed border-ink/15 px-5 py-10 text-sm text-muted">
              Пока никто не открыл канал.
            </li>
          ) : (
            channels.map((channel) => (
              <li key={channel.id}>
                <Link href={`/channels/${channel.slug}`} className="topic-card group hover:text-ink">
                  <span className="block font-serif text-xl leading-snug tracking-tight group-hover:text-rust">
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
