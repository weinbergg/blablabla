"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { BookCover } from "./book-cover";
import type { PublicationBlock, TextAnchor } from "@/lib/publication-content";

type SavedQuote = { id: string; title: string; authors: string; format: string; anchor: TextAnchor; comment: string };
export function SavedQuotePicker({ onSelect }: { onSelect: (block: PublicationBlock) => void }) {
  const [quotes, setQuotes] = useState<SavedQuote[]>([]), [page, setPage] = useState(1), [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(true), [error, setError] = useState("");
  const [selected, setSelected] = useState<SavedQuote | null>(null), [includeComment, setIncludeComment] = useState(false);
  useEffect(() => {
    const abort = new AbortController(); setBusy(true); setError("");
    fetch(`/api/community/quotes?page=${page}`, { signal: abort.signal, cache: "no-store" }).then(async r => { const data = await r.json(); if (!r.ok) throw Error(data.error || "Не удалось загрузить пометки"); return data; })
      .then(data => { setQuotes(data.quotes); setHasMore(data.hasMore); }).catch(e => { if (!abort.signal.aborted) setError(e.message); }).finally(() => { if (!abort.signal.aborted) setBusy(false); });
    return () => abort.abort();
  }, [page]);
  if (selected) return <div className="mt-5 space-y-5">
    <button type="button" className="text-sm text-muted hover:text-rust" onClick={() => setSelected(null)}>← К моим пометкам</button>
    <p className="text-sm text-muted">{selected.title}</p><blockquote className="border-l-2 border-rust pl-4 font-serif text-xl leading-8">{selected.anchor.exact}</blockquote>
    {selected.comment && <label className="block text-sm leading-6"><span className="flex items-start gap-3"><input type="checkbox" className="mt-1 size-4 accent-rust" checked={includeComment} onChange={e => setIncludeComment(e.target.checked)} />Добавить мой комментарий в публикацию</span><span className="mt-3 block whitespace-pre-wrap border-l border-ink/15 pl-7 text-muted">{selected.comment}</span></label>}
    <p className="text-xs leading-6 text-muted">Исходная пометка не изменится. В публикацию попадёт выбранный фрагмент, а комментарий — только с вашего согласия.</p>
    <button type="button" className="button-primary" onClick={() => onSelect({ id: crypto.randomUUID(), type: "quote", anchor: selected.anchor, title: selected.title, authors: selected.authors, format: selected.format, comment: includeComment ? selected.comment.slice(0, 4000) : "" })}>Вставить выбранный фрагмент</button>
  </div>;
  return <div className="mt-5">{busy ? <p role="status" className="py-6 text-sm text-muted">Загружаем ваши пометки…</p> : error ? <p role="alert" className="py-6 text-sm text-rust">{error}</p> : <>
    {!quotes.length && <p className="py-6 text-sm leading-7 text-muted">Пока нет сохранённых фрагментов. Выделите текст в читалке и добавьте пометку — здесь появится цитата с точной ссылкой. <Link href="/notes" className="text-rust underline">Все мои пометки</Link></p>}
    <div className="max-h-80 divide-y divide-ink/10 overflow-y-auto">{quotes.map(quote => <button type="button" key={quote.id} className="flex w-full gap-3 py-4 text-left hover:text-rust" onClick={() => { setSelected(quote); setIncludeComment(false); }}><BookCover documentId={quote.anchor.documentId} small /><span className="min-w-0"><span className="line-clamp-3 font-serif text-lg leading-7">{quote.anchor.exact}</span><span className="mt-2 block text-xs text-muted">{quote.title}</span></span></button>)}</div>
    {(page > 1 || hasMore) && <div className="mt-4 flex items-center justify-between gap-4 text-sm"><button type="button" disabled={page === 1} className="min-h-11 disabled:opacity-30" onClick={() => setPage(p => p - 1)}>← Назад</button><span className="text-muted">{page}</span><button type="button" disabled={!hasMore} className="min-h-11 disabled:opacity-30" onClick={() => setPage(p => p + 1)}>Далее →</button></div>}
  </>}</div>;
}
