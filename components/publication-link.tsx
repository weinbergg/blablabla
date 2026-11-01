"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowUpRight, BookOpen, X } from "lucide-react";
import { internalBookLink, type BookPreview } from "@/lib/book-links";
import { languageLabel } from "@/lib/languages";
import { BookCover } from "./book-cover";

// Only deduplicate simultaneous public-metadata requests; no session-dependent cache.
const pending = new Map<string, Promise<BookPreview>>();
function preview(id: string) {
  if (!pending.has(id)) pending.set(id, fetch(`/api/documents/${id}/preview`).then(async r => {
    if (!r.ok) throw Error("Информация о книге сейчас недоступна.");
    return r.json() as Promise<BookPreview>;
  }).finally(() => pending.delete(id)));
  return pending.get(id)!;
}

function BookSummary({ book }: { book: BookPreview }) {
  return <span className="flex items-start gap-4 text-left font-sans normal-case tracking-normal">
    <BookCover documentId={book.id} small />
    <span className="min-w-0"><span className="block font-serif text-xl leading-7 text-ink">{book.title}</span>
      {book.authors && <span className="mt-2 block text-sm leading-5 text-muted">{book.authors}</span>}
      <span className="mt-3 block text-xs text-muted">{[book.format.toUpperCase(), languageLabel(book.language), book.year].filter(Boolean).join(" · ")}</span>
      {book.description && <span className="mt-3 line-clamp-4 block text-sm leading-6 text-muted">{book.description}</span>}
    </span>
  </span>;
}

export function PublicationLink({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  const [link, setLink] = useState<ReturnType<typeof internalBookLink>>(null);
  const [book, setBook] = useState<BookPreview | null>(null);
  const [error, setError] = useState("");
  const [hover, setHover] = useState<{ left: number; top: number } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const value = internalBookLink(href, location.origin); setLink(value); setBook(null); setError("");
    if (!value) return;
    let cancelled = false;
    preview(value.id).then(data => { if (!cancelled) setBook(data); }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [href]);
  useEffect(() => {
    if (!hover) return;
    const hide = () => setHover(null);
    window.addEventListener("scroll", hide, true); window.addEventListener("resize", hide); window.addEventListener("keydown", hide);
    return () => { window.removeEventListener("scroll", hide, true); window.removeEventListener("resize", hide); window.removeEventListener("keydown", hide); };
  }, [hover]);
  if (!link) return <a href={href} rel="noopener noreferrer" className={className}>{children}</a>;
  return <span className="book-inline" data-book-link={link.id}>
    <Link href={link.href} className={`decoration-rust/35 underline underline-offset-4 hover:text-rust ${className}`} onMouseEnter={e => {
      if (!book || !matchMedia("(hover: hover)").matches) return;
      const rect = e.currentTarget.getBoundingClientRect();
      setHover({ left: Math.max(12, Math.min(rect.left, innerWidth - 348)), top: Math.max(12, Math.min(rect.bottom + 8, innerHeight - 300)) });
    }} onMouseLeave={() => setHover(null)}>{book?.title || (error ? "Книга недоступна" : "Книга в библиотеке")}</Link>
    {book?.authors && <span className="text-muted"> — {book.authors}</span>}
    <button type="button" aria-label={`О книге${book ? ` «${book.title}»` : ""}`} aria-haspopup="dialog" onClick={() => { setHover(null); dialog.current?.showModal(); }} className="ml-1 inline-flex size-9 items-center justify-center align-middle text-muted hover:bg-ink/5 hover:text-rust"><BookOpen size={15} /></button>
    {hover && book && createPortal(<span role="tooltip" className="pointer-events-none fixed z-50 block w-[21rem] max-w-[calc(100vw-1.5rem)] border border-ink/20 bg-paper p-4 shadow-sm" style={hover}><BookSummary book={book} /></span>, document.body)}
    {createPortal(<dialog ref={dialog} className="publication-dialog" aria-label="О книге" onClick={e => { if (e.target === e.currentTarget) dialog.current?.close(); }}>
      <div className="mb-5 flex items-center justify-between gap-3"><span className="eyebrow">Из библиотеки Blabla</span><button type="button" autoFocus aria-label="Закрыть сведения о книге" onClick={() => dialog.current?.close()} className="p-2"><X size={20} /></button></div>
      {book ? <BookSummary book={book} /> : <p role="status" className="text-sm leading-6">{error || "Загружаем сведения…"}</p>}
      <Link href={link.href} className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm text-rust" onClick={() => dialog.current?.close()}>Открыть книгу <ArrowUpRight size={16} /></Link>
    </dialog>, document.body)}
  </span>;
}
