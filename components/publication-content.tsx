"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, MessageSquare, Repeat2, X } from "lucide-react";
import { ROOM_FORMATS } from "@/lib/room-types";
import { PublicationFile, PublicationVideo } from "./publication-media";
import { useFeature } from "./feature-provider";
import { PublicationQuote } from "./publication-quote";
import { PublicationLink } from "./publication-link";
import { linkifyPlain } from "./linked-text";
import { BookCover } from "./book-cover";
import { ChannelPostBody } from "./channel-post-body";
import { safeHref, videoEmbed, type PublicationContent as Content, type RichNode, type TextAnchor } from "@/lib/publication-content";

export { anchorHref } from "@/lib/publication-content";
function EventTime({ value }: { value: string }) {
  const format = (timeZone?: string) => new Date(value).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZoneName: "short", timeZone });
  const [label, setLabel] = useState(() => format("UTC"));
  useEffect(() => { setLabel(new Date(value).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZoneName: "short" })); }, [value]);
  return <time className="mt-3 block text-sm" dateTime={value}>{label}</time>;
}
function Rich({ node }: { node: RichNode }): ReactNode {
  let children: ReactNode = node.text !== undefined ? (node.marks?.some(m => m.type === "link" || m.type === "code") ? node.text : linkifyPlain(node.text)) : node.content?.map((n, i) => <Rich key={i} node={n} />);
  for (const mark of node.marks ?? []) {
    if (mark.type === "bold") children = <strong>{children}</strong>;
    if (mark.type === "italic") children = <em>{children}</em>;
    if (mark.type === "strike") children = <s>{children}</s>;
    if (mark.type === "underline") children = <u>{children}</u>;
    if (mark.type === "code") children = <code>{children}</code>;
    if (mark.type === "link") { const href = safeHref(mark.attrs?.href); if (href) children = <PublicationLink href={href}>{children}</PublicationLink>; }
  }
  switch (node.type) {
    case "doc": return children;
    case "text": return children;
    case "paragraph": return <p>{children || <br />}</p>;
    case "heading": return node.attrs?.level === 3 ? <h3>{children}</h3> : <h2>{children}</h2>;
    case "bulletList": return <ul>{children}</ul>;
    case "orderedList": return <ol>{children}</ol>;
    case "listItem": return <li>{children}</li>;
    case "blockquote": return <blockquote>{children}</blockquote>;
    case "horizontalRule": return <hr />;
    case "hardBreak": return <br />;
    default: return null;
  }
}
function Picture({ id, caption }: { id: string; caption: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return <figure className="min-w-0">
    <button type="button" className="block w-full cursor-zoom-in" aria-label={caption || "Увеличить изображение"} onClick={() => dialog.current?.showModal()}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/community/files/${id}`} alt={caption} loading="lazy" className="max-h-[38rem] w-full object-contain bg-ink/3" />
    </button>
    {caption && <figcaption className="mt-2 text-sm leading-6 text-muted">{caption}</figcaption>}
    <dialog ref={dialog} className="publication-lightbox" onClick={e => { if (e.target === e.currentTarget) dialog.current?.close(); }}>
      <button type="button" aria-label="Закрыть изображение" onClick={() => dialog.current?.close()} className="absolute right-3 top-3 z-10 bg-paper p-3 text-ink"><X size={20} /></button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/community/files/${id}`} alt={caption} className="max-h-[85dvh] max-w-full object-contain" />
      {caption && <p className="p-3 text-sm">{caption}</p>}
    </dialog>
  </figure>;
}
export function PublicationContent({ content, fallback = "", compact = false, onDiscussQuote }: { content: Content | null; fallback?: string; compact?: boolean; onDiscussQuote?: (anchor: TextAnchor) => void }) {
  const forum = useFeature("forum");
  if (!content) return <ChannelPostBody text={fallback} />;
  const blocks = compact ? content.blocks.slice(0, 3) : content.blocks;
  return <div className="publication-content space-y-7">
    {blocks.map(block => {
      switch (block.type) {
        case "text": return <div key={block.id} className={`publication-prose ${compact ? "line-clamp-6" : ""}`}><Rich node={block.doc} /></div>;
        case "divider": return <hr key={block.id} className="my-8 border-ink/15" />;
        case "image": case "gallery": return <div key={block.id} className={block.files.length > 1 ? "grid grid-cols-2 gap-3" : ""}>{block.files.map(file => <Picture key={file.id} {...file} />)}</div>;
        case "file": return <PublicationFile key={block.id} {...block} />;
        case "video": return <figure key={block.id}>{block.fileId ? <PublicationVideo fileId={block.fileId} caption={block.caption} /> : block.url && videoEmbed(block.url) ? <iframe className="aspect-video w-full border-0" title={block.caption || "Видео"} src={videoEmbed(block.url)!} loading="lazy" allow="fullscreen; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen /> : <p>Видео недоступно</p>}{block.caption && <figcaption className="mt-2 text-sm text-muted">{block.caption}</figcaption>}</figure>;
        case "book": return <div key={block.id} className="border-y border-ink/15 py-5">
          <Link href={`/documents/${block.documentId}`} className="group flex items-center gap-4 sm:gap-5">
            <BookCover documentId={block.documentId} small={compact} />
            <span className="min-w-0"><span className="eyebrow">Из библиотеки{block.format ? ` · ${block.format.toUpperCase()}` : ""}</span><span className={`mt-2 block font-serif leading-tight group-hover:text-rust ${compact ? "text-xl" : "text-2xl"}`}>{block.title || "Открыть книгу"}</span>{block.authors && <span className="mt-2 block text-sm text-muted">{block.authors}</span>}<span className="mt-3 flex items-center gap-2 text-xs text-rust">Читать произведение <ArrowUpRight size={13} /></span></span>
          </Link>
          {!compact && forum && <Link href={`/discuss?documentId=${encodeURIComponent(block.documentId)}`} className="mt-4 inline-flex min-h-9 items-center gap-2 text-xs text-muted hover:text-rust"><MessageSquare size={14} />Обсуждения книги</Link>}
        </div>;
        case "quote": return <PublicationQuote key={block.id} block={block} compact={compact} onDiscuss={onDiscussQuote} />;
        case "link": return block.event ? <Link key={block.id} href={block.href} className="block border-y-2 border-ink/20 py-6 hover:border-rust/50"><span className="flex items-center gap-2 text-xs text-rust"><CalendarDays size={16} />{ROOM_FORMATS.find(f => f.id === block.event!.kind)?.label || "Встреча читателей"}</span><span className="mt-3 block font-serif text-3xl leading-tight">{block.event.title}</span>{block.event.startsAt && <EventTime value={block.event.startsAt} />}{block.event.summary && <span className="mt-3 block text-sm leading-7 text-muted">{block.event.summary}</span>}<span className="mt-5 flex items-center gap-2 text-sm text-rust">Программа и участие <ArrowUpRight size={15} /></span></Link> : <div key={block.id} className="border-y border-ink/15 py-4"><PublicationLink href={safeHref(block.href) || "#"} className="font-serif text-xl leading-8">{block.label}</PublicationLink>{block.description && <p className="mt-2 text-sm leading-6 text-muted">{block.description}</p>}</div>;
        case "repost": return <a key={block.id} href={safeHref(block.href) || "#"} className="flex items-center gap-3 border-l-2 border-ink/20 py-4 pl-4 text-sm hover:text-rust"><Repeat2 size={18} />{block.label || "Исходная публикация"}<ArrowUpRight size={14} /></a>;
      }
    })}
  </div>;
}
