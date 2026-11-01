import Link from "next/link";
import { ArrowUpRight, FileText, Play, Quote } from "lucide-react";
import { sqlite } from "@/lib/db/client";
import { channelMedia, MEDIA_CATEGORIES } from "@/lib/channel-media";
import { BookCover } from "./book-cover";

export function ChannelMedia({ channelId, category, page }: { channelId: string; category?: string; page: number }) {
  const active = MEDIA_CATEGORIES.find(([id]) => id === category)?.[0] || "all";
  const { items, hasMore } = channelMedia(sqlite, channelId, active, page);
  return <section aria-label="Медиатека канала">
    <div className="mb-6"><h2 className="font-serif text-3xl">На книжной полке канала</h2><p className="mt-3 text-sm leading-6 text-muted">Книги, фрагменты и материалы из опубликованных записей. Откройте материал, чтобы вернуться к разговору.</p></div>
    <nav className="mb-6 flex flex-wrap gap-2" aria-label="Тип материала">{MEDIA_CATEGORIES.map(([id, label]) => <Link key={id} href={`?tab=media&media=${id}`} aria-current={active === id ? "page" : undefined} className={`px-3 py-2 text-sm ${active === id ? "bg-ink text-paper" : "border border-ink/15 hover:border-rust/50"}`}>{label}</Link>)}</nav>
    {!items.length ? <p className="border-y border-ink/15 py-10 text-sm leading-7 text-muted">В этой категории пока нет опубликованных материалов.</p> : <div className="grid gap-x-6 gap-y-7 sm:grid-cols-2">{items.map(({ postId, href, title, block }, index) => <Link key={`${postId}-${block.id}-${index}`} href={href} className="group flex min-w-0 flex-col border-b border-ink/15 pb-5">
      {(block.type === "image" || block.type === "gallery") && <div className="relative mb-4 bg-ink/5">{/* Session-protected files use the existing access endpoint. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/community/files/${block.files[0].id}`} alt={block.files[0].caption || "Фотография из публикации"} loading="lazy" className="aspect-[4/3] w-full object-contain" />{block.files.length > 1 && <span className="absolute bottom-2 right-2 bg-paper px-2 py-1 text-xs">{block.files.length} фото</span>}</div>}
      {block.type === "book" && <div className="mb-4 flex items-center gap-4"><BookCover documentId={block.documentId} /><span className="min-w-0"><span className="font-serif text-xl leading-7">{block.title || "Книга из библиотеки"}</span>{block.authors && <span className="mt-2 block text-xs text-muted">{block.authors}</span>}</span></div>}
      {block.type === "quote" && <div className="mb-4 border-l-2 border-rust pl-4"><Quote size={18} className="mb-2 text-rust/70" /><blockquote className="line-clamp-5 font-serif text-xl leading-8">{block.anchor.exact}</blockquote><p className="mt-3 text-xs text-muted">{block.title || "Цитата из библиотеки"}</p></div>}
      {block.type === "video" && <div className="mb-4 flex aspect-video items-center justify-center bg-ink/5"><span className="flex max-w-full flex-col items-center gap-3 px-4 text-center text-sm"><Play size={30} strokeWidth={1} />{block.caption || "Видео к публикации"}</span></div>}
      {block.type === "file" && <div className="mb-5 flex gap-3 py-4"><FileText size={24} className="shrink-0 text-muted" /><span className="break-words text-sm">{block.label}</span></div>}
      <span className="mt-auto flex items-start justify-between gap-3 text-xs leading-6 text-muted group-hover:text-rust"><span className="line-clamp-2">{title}</span><ArrowUpRight size={14} className="mt-1 shrink-0" /></span>
    </Link>)}</div>}
    <nav className="mt-8 flex justify-between text-sm" aria-label="Страницы медиатеки">{page > 1 ? <Link className="py-3" href={`?tab=media&media=${active}&page=${page - 1}`}>← Предыдущие</Link> : <span />}{hasMore && <Link className="py-3" href={`?tab=media&media=${active}&page=${page + 1}`}>Следующие →</Link>}</nav>
  </section>;
}
