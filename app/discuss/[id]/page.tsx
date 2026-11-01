import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Header } from "@/components/header";
import { ForumReplyForm } from "@/components/forum-reply-form";
import { ForumThread } from "@/components/forum-thread";
import { MathText } from "@/components/math-text";
import { RoleBadge, UserAvatar } from "@/components/user-avatar";
import { AttachmentList } from "@/components/attachment-list";
import { DiscussionSourceView } from "@/components/discussion-source";
import { TopicModeration, TopicWatchButton } from "@/components/topic-watch-button";
import { getCurrentUser } from "@/lib/auth";
import { getForumTopic, isWatching, FORUM_PAGE_SIZE } from "@/lib/db/forum";
import { forumCategoryLabel } from "@/lib/forum-meta";
import { featureEnabled } from "@/lib/features";
export const dynamic = "force-dynamic";
export default async function DiscussTopicPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string; post?: string }> }) {
  const { id } = await params; const query = await searchParams; const user = await getCurrentUser();
  const data = await getForumTopic(id, user?.id, { page: Number(query.page) || 1, post: query.post }); if (!data) notFound();
  const { topic, posts, attachments, filesByPost, reactionsByPost, page, pages, total, lastSeq } = data;
  if (topic.seminarSlug) redirect(`/seminars/${topic.seminarSlug}/read`);
  const watching = user ? await isWatching(user.id, id) : false;
  const commentsEnabled = await featureEnabled("comments", user); const roomsEnabled = await featureEnabled("room_creation", user);
  const canModerate = !!user && (user.id === topic.authorId || user.role === "admin");
  const pagination = <nav aria-label="Страницы ответов" className="my-7 flex flex-wrap items-center justify-between gap-4 border-y border-ink/15 py-4 text-sm">{page > 1 ? <Link href={`/discuss/${id}?page=${page - 1}#answers`}>← Предыдущие</Link> : <span className="text-muted">Начало разговора</span>}<span className="text-xs text-muted">{page} / {pages}</span>{page < pages ? <Link href={`/discuss/${id}?page=${page + 1}#answers`}>Дальше →</Link> : <a href="#discussion-compose" className="text-rust">Добавить ответ ↓</a>}</nav>;
  return <><Header /><main className="shell py-8 sm:py-12"><Link href="/discuss" className="text-sm text-muted hover:text-rust">← Все обсуждения</Link><div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-16"><article className="min-w-0 max-w-3xl"><p className="eyebrow">{forumCategoryLabel(topic.category)}{topic.pinned ? " · Закреплено" : ""}</p><h1 className="mt-4 font-serif text-4xl leading-tight tracking-tight sm:text-5xl">{topic.title}</h1><div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-muted"><UserAvatar userId={topic.authorId} avatarKey={topic.authorAvatarKey} avatarColor={topic.authorAvatarColor} name={topic.authorName} size={32} /><Link href={`/users/${topic.authorId}`} className="font-medium text-ink">{topic.authorName}</Link><RoleBadge role={topic.authorRole} /><time>{new Date(topic.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}</time></div>
      <MathText source={topic.body} className="mt-8 text-lg leading-9" /><DiscussionSourceView documentId={topic.documentId} title={topic.documentTitle} anchorJson={topic.anchorJson} /><AttachmentList items={attachments} canEdit={canModerate} />
      <section id="answers" className="mt-12 scroll-mt-24"><div className="flex items-baseline justify-between border-t-2 border-ink pt-6"><h2 className="font-serif text-3xl">Разговор</h2><span className="text-sm text-muted">{total} сообщений</span></div>{pages > 1 && pagination}<div className="mt-7"><ForumThread topicId={id} topicTitle={topic.title} posts={posts} currentUserId={user?.id ?? null} locked={!!topic.locked || !commentsEnabled} canModerate={canModerate} filesByPost={filesByPost} reactionsByPost={reactionsByPost} offset={(page - 1) * FORUM_PAGE_SIZE} lastSeq={lastSeq} /></div>{pages > 1 && pagination}</section>
      {!commentsEnabled || topic.locked ? <p id="discussion-compose" className="mt-8 border-l-2 border-ink/20 pl-4 text-sm leading-7 text-muted">{topic.locked ? "Ответы в этой теме закрыты. Разговор остаётся доступным для чтения." : "Комментарии временно отключены."}</p> : user ? <ForumReplyForm topicId={id} currentUserId={user.id} composeId="discussion-compose" /> : <p className="mt-8 text-sm text-muted"><Link href={`/login?next=${encodeURIComponent(`/discuss/${id}`)}`} className="text-rust underline">Войдите</Link>, чтобы присоединиться к разговору.</p>}
    </article><aside className="h-fit border-t border-ink/15 py-5 lg:sticky lg:top-24"><p className="eyebrow">Этот разговор</p><p className="mt-4 text-sm leading-7 text-muted">Следите за ответами и возвращайтесь к важным мыслям. Новые сообщения отмечаются в ваших подписках.</p><div className="mt-5">{user && <TopicWatchButton topicId={id} watching={watching} />}</div>{canModerate && <TopicModeration topicId={id} locked={!!topic.locked} pinned={!!topic.pinned} admin={user?.role === "admin"} />}{topic.documentId && <div className="mt-7 border-t border-ink/15 pt-5"><p className="eyebrow">Продолжить чтение</p><Link href={`/documents/${topic.documentId}`} className="mt-3 block font-serif text-xl hover:text-rust">{topic.documentTitle} ↗</Link>{roomsEnabled && <Link href={`/seminars/new?book=${encodeURIComponent(topic.documentId)}`} className="mt-5 block text-sm text-rust">Открыть совместное чтение →</Link>}</div>}<Link href="/discuss?mode=watching" className="mt-7 block text-sm text-muted hover:text-rust">Мои подписки →</Link></aside></div></main></>;
}
