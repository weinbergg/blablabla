"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChatMessage } from "./chat-message";
import { ForumReplyForm } from "./forum-reply-form";
import { AttachmentList, type ShownAttachment } from "./attachment-list";
import { DiscussionSourceView } from "./discussion-source";
import { ReportDialog } from "./report-dialog";
import { commentRequest, commentError } from "@/lib/comment-request";
import type { ReactionCount, ReactionKey } from "@/lib/reactions";
import { readableMessage } from "@/lib/share-message";
export type ForumPostItem = { id: string; parentId: string | null; parentExcerpt?: string | null; body: string; createdAt: string; updatedAt: string | null; authorId: string; authorName: string; authorRole: string; authorAvatarKey: string | null; authorAvatarColor: string | null; deletedAt?: string | null; documentId?: string | null; documentTitle?: string | null; anchorJson?: string | null };
export function ForumThread({ topicId, topicTitle, posts, currentUserId, locked, canModerate = false, filesByPost, reactionsByPost, offset = 0, lastSeq = 0 }: { topicId: string; topicTitle: string; posts: ForumPostItem[]; currentUserId: string | null; locked: boolean; canModerate?: boolean; filesByPost?: Record<string, ShownAttachment[]>; reactionsByPost?: Record<string, ReactionCount[]>; offset?: number; lastSeq?: number }) {
  const router = useRouter(); const query = useSearchParams(); const [replyTo, setReplyTo] = useState<string | null>(null); const [error, setError] = useState(""); const [reported, setReported] = useState<string | null>(null); const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Old shared links had only a hash. Resolve their page without guessing a parent.
    const id = location.hash.match(/^#comment-([\w-]+)$/)?.[1];
    if (id && !posts.some(post => post.id === id) && !query.has("post")) router.replace(`/discuss/${topicId}?post=${encodeURIComponent(id)}#comment-${id}`);
  }, [topicId, posts, router, query]);
  useEffect(() => {
    if (!currentUserId || !lastSeq || !end.current) return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { void fetch(`/api/forum/topics/${topicId}/watch`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seen: lastSeq }) }).catch(() => {}); observer.disconnect(); } }); observer.observe(end.current); return () => observer.disconnect();
  }, [topicId, lastSeq, currentUserId]);
  async function react(id: string, key: ReactionKey) { try { await commentRequest(`/api/forum/posts/${id}/reactions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) }); router.refresh(); } catch (e) { setError(commentError(e)); } }
  async function edit(id: string, body: string) { await commentRequest(`/api/forum/posts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) }); router.refresh(); }
  return <div>{!posts.length && <p className="py-8 text-sm leading-7 text-muted">Первый ответ задаёт тон разговору. Поделитесь тем, что показалось вам важным.</p>}{posts.map((post, index) => <article key={post.id} className="border-b border-ink/15 py-8 first:pt-2">
    <div className="mb-4 flex items-start justify-between gap-4 text-xs text-muted">{post.parentId ? <Link href={`/discuss/${topicId}?post=${post.parentId}#comment-${post.parentId}`} className="min-w-0 flex-1 border-l-2 border-ink/20 pl-3 hover:text-rust"><span className="block">В ответ на сообщение ↗</span><span className="mt-1 block line-clamp-2 leading-6">{readableMessage(post.parentExcerpt || "Открыть исходное сообщение")}</span></Link> : <span>Продолжение разговора</span>}<Link href={`/discuss/${topicId}?post=${post.id}#comment-${post.id}`} className="shrink-0 font-mono hover:text-rust">№ {offset + index + 1}</Link></div>
    {post.deletedAt ? <p id={`comment-${post.id}`} className="py-4 text-sm italic text-muted">Сообщение удалено. Ответы и порядок разговора сохранены.</p> : <>
      <ChatMessage layout="discussion" item={{ id: post.id, body: post.body, createdAt: post.createdAt, updatedAt: post.updatedAt, author: { id: post.authorId, name: post.authorName, role: post.authorRole, avatarKey: post.authorAvatarKey, avatarColor: post.authorAvatarColor } }} currentUserId={currentUserId} documentTitle={topicTitle} shareUrl={`/discuss/${topicId}?post=${post.id}#comment-${post.id}`} privacy="both" forwardLabel="Поделиться" reactions={reactionsByPost?.[post.id] ?? []} canReact={!!currentUserId} onReact={key => void react(post.id, key)} onReply={currentUserId && !locked ? () => setReplyTo(post.id) : undefined} onReport={currentUserId ? () => setReported(post.id) : undefined} onEdit={!locked && (currentUserId === post.authorId || canModerate) ? body => edit(post.id, body) : undefined} onDelete={currentUserId === post.authorId || canModerate ? async () => { if (!confirm("Убрать сообщение из обсуждения? Ответы на него останутся.")) return; await commentRequest(`/api/forum/posts/${post.id}`, { method: "DELETE" }); router.refresh(); } : undefined} />
      <div className="mt-4 sm:pl-[62px]"><DiscussionSourceView documentId={post.documentId} title={post.documentTitle} anchorJson={post.anchorJson} /><AttachmentList items={filesByPost?.[post.id] ?? []} canEdit={currentUserId === post.authorId || canModerate} />{replyTo === post.id && currentUserId && !locked && <ForumReplyForm topicId={topicId} parentId={post.id} currentUserId={currentUserId} quote={readableMessage(post.body).slice(0, 500)} compact onDone={() => setReplyTo(null)} />}</div>
    </>}
  </article>)}{error && <p role="alert" className="mt-4 text-sm text-rust">{error}</p>}<div ref={end} className="h-px" /><ReportDialog open={!!reported} targetType="forum_post" targetId={reported} onClose={() => setReported(null)} /></div>;
}
