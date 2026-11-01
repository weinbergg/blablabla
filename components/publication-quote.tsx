"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Copy, MessageSquare, NotebookPen } from "lucide-react";
import { anchorHref, type PublicationBlock, type TextAnchor } from "@/lib/publication-content";
import { QuotePublish } from "./readers/quote-publish";

type Note = { id: string; body: string; authorName: string; visibility: string };
export function PublicationQuote({ block, compact, onDiscuss }: { block: Extract<PublicationBlock, { type: "quote" }>; compact: boolean; onDiscuss?: (anchor: TextAnchor) => void }) {
  const [expanded, setExpanded] = useState(false), [copied, setCopied] = useState(false), [error, setError] = useState("");
  const [notes, setNotes] = useState<Note[] | null>(null), [notesOpen, setNotesOpen] = useState(false), [loading, setLoading] = useState(false), [more, setMore] = useState(false);
  const textId = useId(), notesId = useId();
  const long = block.anchor.exact.length > 420 || block.anchor.exact.split("\n").length > 6;
  const text = long && !expanded ? block.anchor.exact.slice(0, 420).split("\n").slice(0, 6).join("\n").trimEnd() + "…" : block.anchor.exact;
  const href = anchorHref(block.anchor);
  const location = `${block.format === "epub" || block.anchor.cfi ? "Глава" : block.format === "txt" ? "Раздел" : "Страница"} ${block.anchor.page}`;
  async function showNotes() {
    if (notesOpen) { setNotesOpen(false); return; }
    setNotesOpen(true); setLoading(true); setError("");
    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(block.anchor.documentId)}/annotations/context`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(block.anchor), cache: "no-store" });
      if (!response.ok) throw Error("Не удалось загрузить пометки. Закройте панель и попробуйте ещё раз.");
      const data = await response.json(); setNotes(data.items); setMore(data.hasMore);
    } catch (e) { setNotes(null); setError(e instanceof Error ? e.message : "Не удалось загрузить пометки."); }
    finally { setLoading(false); }
  }
  return <figure className="publication-quote border-y border-ink/15 py-5" data-quote-block={block.id}>
    <div className={`border-l-2 border-rust ${compact ? "pl-4" : "pl-5 sm:pl-6"}`}>
      <blockquote id={textId} className={`whitespace-pre-wrap break-words font-serif text-xl leading-relaxed ${long && !expanded ? "line-clamp-6" : ""}`}>{text}</blockquote>
      {long && <button type="button" aria-expanded={expanded} aria-controls={textId} onClick={() => setExpanded(!expanded)} className="mt-2 min-h-10 text-xs text-rust">{expanded ? "Свернуть цитату" : "Читать цитату целиком"}</button>}
      <figcaption className="mt-4 text-sm leading-6"><Link href={href} className="font-medium underline decoration-ink/20 underline-offset-4 hover:text-rust">{block.title || "Источник в библиотеке"}</Link>{block.authors && <span className="block text-muted">{block.authors}</span>}
        <Link className="mt-1 inline-flex min-h-10 items-center gap-1 text-xs text-muted hover:text-rust" href={href}>{location} · к фрагменту <ArrowUpRight size={12} /></Link>
      </figcaption>
    </div>
    {block.comment && <p className={`mt-4 whitespace-pre-wrap text-base leading-7 ${compact ? "line-clamp-4" : ""}`}>{block.comment}</p>}
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted" aria-label="Действия с цитатой">
      {onDiscuss && <button type="button" onClick={() => onDiscuss(block.anchor)} className="inline-flex min-h-10 items-center gap-1.5 hover:text-rust"><MessageSquare size={14} />Обсудить цитату</button>}
      <button type="button" className="inline-flex min-h-10 items-center gap-1.5 hover:text-rust" onClick={async () => { setError(""); try { await navigator.clipboard.writeText(`«${block.anchor.exact}»\n${[block.title, block.authors, location].filter(Boolean).join(" — ")}\n${locationOrigin() + href}`); setCopied(true); } catch { setError("Браузер не разрешил копирование. Выделите текст цитаты и скопируйте его вручную."); } }}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Скопировано" : "Скопировать цитату"}</button>
      <button type="button" className="inline-flex min-h-10 items-center gap-1.5 hover:text-rust" aria-expanded={notesOpen} aria-controls={notesId} disabled={loading} onClick={() => void showNotes()}><NotebookPen size={14} />Пометки к фрагменту</button>
    </div>
    <QuotePublish anchor={block.anchor} publicationTitle={block.title || "Цитата из библиотеки"} />
    {copied && <span role="status" className="sr-only">Цитата и ссылка на источник скопированы</span>}
    {notesOpen && <div id={notesId} className="mt-3 border-t border-ink/10 pt-4 text-sm leading-6" aria-label="Доступные пометки к цитате">
      {loading ? <p role="status" className="text-muted">Загружаем пометки…</p> : notes?.length ? <><p className="mb-3 text-xs text-muted">Публичные пометки и ваши личные записи к этому точному фрагменту.</p>{notes.map(note => <div key={note.id} className="mb-4"><p className="whitespace-pre-wrap break-words">{note.body}</p><p className="mt-1 text-xs text-muted">{note.authorName}{note.visibility === "private" ? " · Только вам" : " · Публичная пометка"}</p></div>)}{more && <Link href={href} className="text-rust">Все пометки в читалке →</Link>}</> : notes && <p className="text-muted">Доступных пометок с такой точной привязкой пока нет. Пометки по старым координатам можно посмотреть в читалке.</p>}
    </div>}
    {error && <p role="alert" className="mt-3 text-xs leading-6 text-rust">{error}</p>}
  </figure>;
}
function locationOrigin() { return window.location.origin; }
