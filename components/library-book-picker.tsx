"use client";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";

import { BookCover } from "./book-cover";

export type LibraryBook = { id: string; title: string; authorNames: string; format?: string; language?: string };
export function LibraryBookPicker({ onSelect }: { onSelect: (book: LibraryBook) => void }) {
  const [query, setQuery] = useState(""); const [hits, setHits] = useState<LibraryBook[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => {
    if (query.trim().length < 2) { setHits([]); setBusy(false); setError(""); return; }
    setBusy(true); setHits([]);
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      setBusy(true); setError("");
      try { const response = await fetch(`/api/catalog/search?q=${encodeURIComponent(query)}`, { signal: abort.signal }); if (!response.ok) throw new Error("Не удалось загрузить библиотеку"); setHits((await response.json()).documents ?? []); }
      catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "Ошибка поиска"); }
      finally { if (!abort.signal.aborted) setBusy(false); }
    }, 250);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [query]);
  return <div><label className="flex items-center gap-3 border-b border-ink/20 py-3"><Search size={18} className="text-muted" /><input autoFocus aria-label="Найти книгу" className="min-w-0 flex-1 bg-transparent outline-none" placeholder="Название или автор" value={query} maxLength={80} onChange={e => setQuery(e.target.value)} /></label>
    <div className="mt-3 max-h-80 overflow-y-auto" aria-live="polite">{busy ? <p className="py-5 text-sm text-muted">Ищем в библиотеке…</p> : error ? <p role="alert" className="py-4 text-sm text-rust">{error}</p> : hits.map(book => <button type="button" key={book.id} className="flex w-full items-start gap-3 border-b border-ink/10 py-4 text-left hover:text-rust" onClick={() => onSelect(book)}><BookCover documentId={book.id} small /><span className="min-w-0 self-center"><span className="font-serif text-xl">{book.title}</span><span className="mt-1 block text-sm text-muted">{book.authorNames}</span><span className="mt-1 block text-xs uppercase tracking-wider text-muted">{[book.format, book.language].filter(Boolean).join(" · ")}</span></span></button>)}{!busy && !error && query.length > 1 && !hits.length && <p className="py-4 text-sm text-muted">Книг не найдено. Попробуйте другую часть названия.</p>}</div>
  </div>;
}
