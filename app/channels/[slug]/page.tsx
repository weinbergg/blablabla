import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, PenLine, Settings2 } from "lucide-react";
import { Header } from "@/components/header";
import { ChannelMedia } from "@/components/channel-media";
import { ChannelFeed } from "@/components/channel-feed";
import { ChannelFollow, ChannelSettings } from "@/components/channel-settings";
import { UserAvatar } from "@/components/user-avatar";
import { getCurrentUser } from "@/lib/auth";
import { getChannelBySlug, getChannelPermissions, listChannelModerators } from "@/lib/db/channels";
import { channelAudience, publicationFeed } from "@/lib/db/feed";
import { featureEnabled } from "@/lib/features";
import { PageView } from "@/components/page-view";
export const dynamic = "force-dynamic";
export default async function ChannelPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string; page?: string; media?: string }> }) {
  const channel = await getChannelBySlug((await params).slug); if (!channel || channel.archived) notFound();
  const user = await getCurrentUser(); const rights = await getChannelPermissions(channel, user);
  const { tab = "posts", page, media } = await searchParams; if (tab === "settings" && !rights.settings) notFound();
  const feed = await publicationFeed(user, { channelId: channel.id, drafts: tab === "drafts", page: Number(page) || 1 });
  const members = rights.team ? await listChannelModerators(channel.id) : [];
  const [forumEnabled, roomsEnabled, feedEnabled] = await Promise.all([featureEnabled("forum", user), featureEnabled("rooms", user), featureEnabled("feed", user)]);
  const audience = channelAudience(channel.id, user?.id);
  const tabs = [{ id: "posts", label: "Публикации" }, { id: "media", label: "Медиатека" }, { id: "about", label: "О канале" }, ...(rights.readDrafts ? [{ id: "drafts", label: "Черновики" }] : [])];
  return <><PageView section="channel" id={channel.id} /><Header /><main className="shell pb-16 pt-6 md:pt-10">
    <Link href="/channels" className="mb-6 inline-flex items-center gap-2 text-sm text-muted hover:text-ink"><ArrowLeft size={14} />Каналы читателей</Link>
    {channel.coverAttachmentId && <div className="mb-7 h-40 overflow-hidden sm:h-56 lg:h-64">{/* Authenticated files must use the browser session, without the image optimizer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/community/files/${channel.coverAttachmentId}`} alt="Обложка канала" className="size-full object-cover" /></div>}
    <header className="border-b border-ink/20 pb-7"><div className="flex flex-wrap items-start justify-between gap-6"><div className="min-w-0 max-w-3xl"><p className="eyebrow mb-3">{channel.kind === "news" ? "Хроника библиотеки" : "Авторское медиа"}</p><div className="flex flex-col items-start gap-4 sm:flex-row">{channel.avatarAttachmentId && <span className="mt-1 size-16 shrink-0 overflow-hidden rounded-full">{/* Authenticated files must use the browser session, without the image optimizer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/community/files/${channel.avatarAttachmentId}`} alt="" className="size-full object-cover" /></span>}<h1 className="min-w-0 [overflow-wrap:anywhere] break-words font-serif text-4xl leading-[1.08] tracking-tight md:text-6xl">{channel.title}</h1></div>{channel.description && <p className="mt-5 max-w-2xl whitespace-pre-wrap text-base leading-8 text-muted">{channel.description}</p>}<Link href={`/users/${channel.ownerId}`} className="mt-5 inline-flex items-center gap-2 text-sm"><UserAvatar userId={channel.ownerId} name={channel.ownerName} avatarKey={channel.ownerAvatarKey} avatarColor={channel.ownerAvatarColor} size={26} />{channel.ownerName}</Link></div><div className="flex flex-wrap gap-2"><ChannelFollow channelId={channel.id} {...audience} signedIn={!!user} />{rights.publish && <Link className="button-secondary" href={`/channels/${channel.slug}/write`}><PenLine size={15} />Написать</Link>}</div></div></header>
    <nav className="mb-8 flex items-center gap-5 overflow-x-auto border-b border-ink/10 text-sm" aria-label="Разделы канала">{tabs.map(t => <Link key={t.id} href={`/channels/${channel.slug}?tab=${t.id}`} aria-current={tab === t.id ? "page" : undefined} className={`shrink-0 border-b-2 py-4 ${tab === t.id ? "border-rust text-ink" : "border-transparent text-muted hover:text-ink"}`}>{t.label}</Link>)}{rights.settings && <Link href={`/channels/${channel.slug}?tab=settings`} className={`ml-auto flex shrink-0 items-center gap-2 py-4 ${tab === "media" ? <ChannelMedia channelId={channel.id} category={media} page={Math.max(1, Math.min(10000, Math.floor(Number(page) || 1)))} /> : tab === "settings" ? "text-rust" : "text-muted"}`}><Settings2 size={15} /><span className="hidden sm:inline">Настройки</span></Link>}</nav>
    <div className="grid gap-12 lg:grid-cols-[minmax(0,44rem)_minmax(12rem,1fr)]"><div className="min-w-0">{tab === "media" ? <ChannelMedia channelId={channel.id} category={media} page={Math.max(1, Math.min(10000, Math.floor(Number(page) || 1)))} /> : tab === "settings" ? <ChannelSettings channel={channel} rights={rights} members={members} /> : tab === "about" ? <section><h2 className="font-serif text-3xl">О чём этот канал</h2><p className="mt-5 whitespace-pre-wrap text-base leading-8">{channel.description || "Автор пока не добавил описание."}</p><p className="mt-6 text-sm text-muted">Канал ведёт {channel.ownerName}. Здесь можно подписаться на новые записи и присоединиться к обсуждениям.</p></section> : <><ChannelFeed posts={feed.posts} currentUserId={user?.id ?? null} /><div className="mt-8 flex justify-between text-sm">{feed.page > 1 ? <Link href={`?tab=${tab}&page=${feed.page - 1}`}>← Предыдущие</Link> : <span />}{feed.hasMore && <Link href={`?tab=${tab}&page=${feed.page + 1}`}>Следующие →</Link>}</div></>}</div>
    <aside className="hidden border-l border-ink/10 pl-8 lg:block"><p className="eyebrow">Продолжить разговор</p><p className="mt-4 font-serif text-2xl leading-snug">Хорошая мысль заслуживает собеседника.</p><div className="mt-6 space-y-4 text-sm">{forumEnabled && <Link className="flex justify-between gap-2 hover:text-rust" href="/discuss">Обсуждения книг<ArrowRight size={15} /></Link>}{roomsEnabled && <Link className="flex justify-between gap-2 hover:text-rust" href="/seminars">Чтения и встречи<ArrowRight size={15} /></Link>}{feedEnabled && <Link className="flex justify-between gap-2 hover:text-rust" href="/news">Лента публикаций<ArrowRight size={15} /></Link>}</div><p className="mt-8 border-t border-ink/10 pt-5 text-xs leading-6 text-muted">Сохраняйте близкие мысли, делитесь цитатами и возвращайтесь к первоисточнику.</p></aside></div>
  </main></>;
}
