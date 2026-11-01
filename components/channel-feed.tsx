"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Bookmark, Check, Heart, MessageCircle, MoreHorizontal, Pin, Repeat2, Send, X } from "lucide-react";
import { useFeature } from "./feature-provider";
import { ReportDialog } from "./report-dialog";
import { PublicationContent } from "./publication-content";
import { parseContent, plainDoc, type TextAnchor } from "@/lib/publication-content";
import { commentError, commentRequest } from "@/lib/comment-request";
import { useCommentDraft } from "@/lib/use-comment-draft";
import type { PublicationItem } from "@/lib/db/feed";

export type FeedPost = PublicationItem;
export type FeedComment = { id: string; postId: string; authorId: string; authorName: string; body: string; createdAt: string; parentId: string | null };
const dateLabel = (value: string) => new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z").toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
export function PublicationCard({ post, currentUserId, full = false }: { post: PublicationItem; currentUserId: string | null; full?: boolean }) {
  const [reportOpen, setReportOpen] = useState(false);
  const commentsEnabled = useFeature("comments");
  const router = useRouter(); const href = post.channelKind === "news" ? `/news/${post.slug}` : `/channels/${post.channelSlug}/${post.slug}`;
  const [liked, setLiked] = useState(post.liked); const [saved, setSaved] = useState(post.saved); const [likes, setLikes] = useState(post.reactionCount);
  const [open, setOpen] = useState(full); const [comments, setComments] = useState<FeedComment[]>([]); const [count, setCount] = useState(post.commentCount);
  const [reply, setReply] = useState<FeedComment | null>(null); const [text, setText] = useCommentDraft(currentUserId ? `${currentUserId}:publication:${post.id}` : null);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(false);
  const [targets, setTargets] = useState<{ id: string; title: string; slug: string }[]>([]); const [target, setTarget] = useState(""); const [repostText, setRepostText] = useState(""); const [reposted, setReposted] = useState(false);
  const repost = useRef<HTMLDialogElement>(null); const lock = useRef(false);
  useEffect(() => { setLiked(post.liked); setSaved(post.saved); setLikes(post.reactionCount); setCount(post.commentCount); }, [post]);
  useEffect(() => {
    if (!commentsEnabled || !open || !post.published) return;
    let cancelled = false; setLoading(true);
    fetch(`/api/channels/posts/${post.id}/interactions`).then(async r => { if (!r.ok) throw new Error("Не удалось загрузить обсуждение"); return r.json(); }).then(data => { if (!cancelled) setComments(data.comments); }).catch(e => { if (!cancelled) setError(commentError(e)); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, post.id, post.published, commentsEnabled]);
  async function mutate(action: () => Promise<void>) {
    if (lock.current) return; lock.current = true; setBusy(true); setError("");
    try { await action(); } catch (e) { setError(commentError(e)); } finally { setBusy(false); lock.current = false; }
  }
  function interact(action: "like" | "save") { void mutate(async () => {
    const data = await commentRequest<{ active: boolean; count: number }>(`/api/channels/posts/${post.id}/interactions`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, active: action === "like" ? !liked : !saved }) });
    if (action === "like") { setLiked(data.active); setLikes(data.count); } else setSaved(data.active);
  }); }
  async function share() {
    repost.current?.showModal(); setReposted(false); setError("");
    try { const r = await fetch("/api/channels/mine"); if (!r.ok) throw new Error("Войдите, чтобы сделать репост"); const data = await r.json(); setTargets(data.channels); setTarget(data.channels[0]?.id ?? ""); } catch (e) { setError(commentError(e)); }
  }
  function discussQuote(anchor: TextAnchor) {
    setOpen(true);
    if (currentUserId && post.commentsOpen !== 0 && !text.trim()) setText(`> ${anchor.exact.slice(0, 1000).replaceAll("\n", "\n> ")}${anchor.exact.length > 1000 ? "…" : ""}\n\n`);
    requestAnimationFrame(() => {
      const section = document.getElementById(`publication-comments-${post.id}`);
      section?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "center" });
      section?.querySelector("textarea")?.focus({ preventScroll: true });
    });
  }
  const content = parseContent(post.contentJson);
  const long = post.body.length > 650 || (content?.blocks.length ?? 0) > 3;
  return <article id={`publication-${post.id}`} className={`min-w-0 ${full ? "" : "border-b border-ink/15 py-8 first:pt-0 sm:py-10"}`}>
    <div className="mb-5 flex items-start justify-between gap-3"><Link href={post.channelKind === "news" ? "/news" : `/channels/${post.channelSlug}`} className="flex min-w-0 items-center gap-3 hover:text-rust">
      {post.channelAvatar ? <span className="size-10 shrink-0 overflow-hidden rounded-full">{/* Authenticated files must use the browser session, without the image optimizer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/community/files/${post.channelAvatar}`} alt="" className="size-full object-cover" /></span> : <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-ink/15 font-serif text-xl text-rust">{post.channelTitle.charAt(0)}</span>}
      <span className="min-w-0"><span className="block truncate text-sm font-semibold">{post.channelTitle}</span><span className="mt-0.5 block text-xs text-muted">{dateLabel(post.createdAt)} · {post.authorName}</span></span>
    </Link>
    <details className="relative shrink-0"><summary aria-label="Действия с публикацией" className="list-none cursor-pointer p-2 text-muted hover:text-ink"><MoreHorizontal size={19} /></summary><div className="absolute right-0 z-20 w-56 border border-ink/15 bg-paper p-2 shadow-lg text-sm">
      <button type="button" className="block w-full p-2 text-left hover:bg-ink/5" onClick={() => void mutate(async () => { await navigator.clipboard.writeText(location.origin + href); })}>Скопировать ссылку</button>
      {currentUserId && !!post.published && <button type="button" className="block w-full p-2 text-left hover:bg-ink/5" onClick={() => setReportOpen(true)}>Пожаловаться</button>}
      {(post.rights.publish || post.rights.moderate) && commentsEnabled && <button type="button" className="block w-full p-2 text-left hover:bg-ink/5" onClick={() => void mutate(async () => { await commentRequest(`/api/channels/posts/${post.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commentsOpen: post.commentsOpen === 0, revision: post.revision }) }); router.refresh(); })}>{post.commentsOpen === 0 ? "Открыть обсуждение" : "Закрыть обсуждение"}</button>}
      {post.rights.publish && <><Link href={`/channels/${post.channelSlug}/write?post=${post.id}`} className="block p-2 hover:bg-ink/5">Редактировать</Link><button type="button" className="block w-full p-2 text-left hover:bg-ink/5" onClick={() => void mutate(async () => { await commentRequest(`/api/channels/posts/${post.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pinned: !post.pinned, revision: post.revision }) }); router.refresh(); })}>{post.pinned ? "Открепить" : "Закрепить в канале"}</button><button type="button" className="block w-full p-2 text-left text-rust hover:bg-rust/5" onClick={() => { if (confirm("Убрать публикацию из канала и ленты?")) void mutate(async () => { await commentRequest(`/api/channels/posts/${post.id}`, { method: "DELETE" }); if (full) router.push(`/channels/${post.channelSlug}`); router.refresh(); }); }}>Удалить публикацию</button></>}
    </div></details></div>
    {(post.pinned || !post.published) ? <p className="mb-3 flex items-center gap-2 text-xs uppercase tracking-widest text-rust">{post.pinned ? <><Pin size={12} /> Закреплено</> : null}{!post.published ? "Черновик" : ""}</p> : null}
    {post.title && <h2 className={`mb-5 font-serif leading-tight tracking-tight ${full ? "text-3xl sm:text-5xl" : "text-2xl sm:text-3xl"}`}>{full ? post.title : <Link href={href} className="hover:text-rust">{post.title}</Link>}</h2>}
    <PublicationContent content={content} fallback={!full && long ? post.body.slice(0, 650) + "…" : post.body} compact={!full} onDiscussQuote={commentsEnabled && post.published ? discussQuote : undefined} />
    {!content && post.documentId && <div className="mt-5"><PublicationContent compact={!full} content={{ version: 1, blocks: [{ id: "legacy-book", type: "book", documentId: post.documentId, title: post.documentTitle || "Произведение в библиотеке" }] }} /></div>}
    {!full && long && <Link href={href} className="mt-5 inline-flex items-center gap-2 text-sm text-rust">Читать целиком <ArrowUpRight size={14} /></Link>}
    {!!post.published && <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-ink/8 pt-3 text-muted">
      <button type="button" aria-label="Нравится" aria-pressed={liked} disabled={busy} onClick={() => interact("like")} className={`flex items-center gap-2 px-2 py-2 text-sm ${liked ? "text-rust" : "hover:text-ink"}`}><Heart size={18} fill={liked ? "currentColor" : "none"} />{likes || ""}</button>
      {commentsEnabled && <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex items-center gap-2 px-2 py-2 text-sm hover:text-ink"><MessageCircle size={18} />{count || ""}<span className="hidden sm:inline">Обсудить</span></button>}
      <button type="button" aria-label="Репост" onClick={() => void share()} className="p-2 hover:text-ink"><Repeat2 size={18} /></button>
      <button type="button" aria-label={saved ? "Убрать из сохранённого" : "Сохранить публикацию"} aria-pressed={saved} disabled={busy} onClick={() => interact("save")} className={`ml-auto p-2 ${saved ? "text-rust" : "hover:text-ink"}`}><Bookmark size={18} fill={saved ? "currentColor" : "none"} /></button>
    </div>}
    {error && <p role="alert" className="mt-3 text-sm text-rust">{error}</p>}
    {commentsEnabled && open && !!post.published && <section id={`publication-comments-${post.id}`} className="mt-5 border-l border-ink/15 pl-4 sm:pl-6" aria-label="Обсуждение публикации">
      {loading ? <p className="py-3 text-sm text-muted">Загружаем обсуждение…</p> : !comments.length && <p className="py-3 text-sm text-muted">Начните разговор. Что вам откликнулось?</p>}
      {comments.map(comment => <div key={comment.id} id={`channel-comment-${comment.id}`} className={`border-b border-ink/8 py-4 ${comment.parentId ? "ml-4" : ""}`}><div className="flex items-center gap-3 text-xs"><Link href={`/users/${comment.authorId}`} className="font-semibold">{comment.authorName}</Link><span className="text-muted">{dateLabel(comment.createdAt)}</span></div>{comment.parentId && <a href={`#channel-comment-${comment.parentId}`} className="mt-1 block text-xs text-muted underline">К исходному сообщению</a>}<p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7">{comment.body}</p><div className="mt-2 flex gap-4 text-xs text-muted">{currentUserId && post.commentsOpen !== 0 && <button type="button" onClick={() => setReply(comments.find(c => c.id === comment.parentId) || comment)}>Ответить</button>}{(comment.authorId === currentUserId || post.rights.moderate) && <button type="button" className="hover:text-rust" disabled={busy} onClick={() => { if (confirm("Удалить комментарий?")) void mutate(async () => { await commentRequest(`/api/channels/comments/${comment.id}`, { method: "DELETE" }); setComments(all => all.filter(c => c.id !== comment.id).map(c => c.parentId === comment.id ? { ...c, parentId: null } : c)); setCount(n => n - 1); }); }}>Удалить</button>}</div></div>)}
      {post.commentsOpen === 0 ? <p className="mt-4 text-sm text-muted">Обсуждение закрыто редакцией.</p> : !currentUserId ? <Link href="/login" className="mt-4 block text-sm text-rust">Войдите, чтобы присоединиться к разговору</Link> : <form className="mt-4" onSubmit={e => { e.preventDefault(); void mutate(async () => { const data = await commentRequest<FeedComment>(`/api/channels/${post.channelId}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId: post.id, body: text, parentId: reply?.id }) }); setComments(all => [...all, data]); setText(""); setReply(null); setCount(n => n + 1); }); }}>
        {reply && <div className="mb-2 flex justify-between gap-2 text-xs text-muted"><span>Ответ: {reply.authorName}</span><button type="button" aria-label="Отменить ответ" onClick={() => setReply(null)}><X size={14} /></button></div>}
        <textarea aria-label="Комментарий к публикации" placeholder="Добавить мысль…" rows={3} maxLength={4000} value={text} onChange={e => setText(e.target.value)} className="w-full border border-ink/15 bg-transparent p-3 text-sm leading-6 outline-rust" /><div className="mt-2 flex justify-end"><button type="submit" disabled={busy || !text.trim()} className="button-secondary"><Send size={14} />Отправить</button></div>
      </form>}
    </section>}
    <ReportDialog open={reportOpen} targetType="channel_post" targetId={post.id} onClose={() => setReportOpen(false)} />
    <dialog ref={repost} className="publication-dialog"><div className="mb-5 flex items-center justify-between"><h3 className="font-serif text-2xl">Поделиться в канале</h3><button type="button" aria-label="Закрыть репост" onClick={() => repost.current?.close()}><X size={19} /></button></div>{reposted ? <p className="flex gap-2 text-rust"><Check size={18} />Публикация появилась в вашем канале.</p> : <><p className="mb-4 text-sm leading-6 text-muted">Ссылка на оригинал останется рядом с вашим комментарием.</p>{targets.length ? <label className="field"><span>Канал</span><select value={target} onChange={e => setTarget(e.target.value)}>{targets.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label> : <Link className="text-sm text-rust underline" href="/channels">Открыть свой канал</Link>}<label className="field mt-4"><span>Ваш комментарий</span><textarea rows={4} value={repostText} onChange={e => setRepostText(e.target.value)} /></label>{error && <p role="alert" className="mt-3 text-sm text-rust">{error}</p>}<button type="button" className="button-primary mt-4" disabled={busy || !target} onClick={() => void mutate(async () => { await commentRequest(`/api/channels/${target}/posts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: post.title, content: { version: 1, blocks: [...(repostText ? [{ id: "comment", type: "text", doc: plainDoc(repostText) }] : []), { id: "source", type: "repost", postId: post.id }] } }) }); setReposted(true); })}>Опубликовать репост</button></>}</dialog>
  </article>;
}
export function ChannelFeed({ posts, currentUserId }: { posts: PublicationItem[]; currentUserId: string | null }) {
  return posts.length ? <div>{posts.map(post => <PublicationCard key={post.id} post={post} currentUserId={currentUserId} />)}</div> : <div className="border-y border-ink/15 py-14"><p className="font-serif text-2xl">Здесь начинается разговор</p><p className="mt-3 max-w-md text-sm leading-7 text-muted">Публикаций пока нет. Выберите другой режим ленты или загляните в каналы читателей.</p><Link className="mt-5 inline-flex text-sm text-rust" href="/channels">Найти интересный канал →</Link></div>;
}
