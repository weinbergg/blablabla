"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { LibraryBookPicker } from "./library-book-picker";
import { PublicationContent } from "./publication-content";
import { anchorFromHash } from "@/lib/text-anchor";
import { validateAnchor, type TextAnchor } from "@/lib/publication-content";
export type DiscussionSourceValue = { documentId: string; title: string; anchor?: TextAnchor } | null;
export function DiscussionSource({ value, onChange }: { value: DiscussionSourceValue; onChange: (source: DiscussionSourceValue) => void }) {
  const [open, setOpen] = useState(false); const [link, setLink] = useState(""); const [error, setError] = useState("");
  return <div className="space-y-3">{value ? <div className="relative border-l-2 border-rust pl-4 pr-7"><button type="button" aria-label="Убрать источник" className="absolute right-0 top-0 p-1 text-muted" onClick={() => onChange(null)}><X size={16} /></button><p className="text-sm font-medium">{value.title || "Произведение в библиотеке"}</p>{value.anchor && <blockquote className="mt-2 line-clamp-4 font-serif text-lg leading-7">{value.anchor.exact}</blockquote>}</div> : <button type="button" className="text-sm text-rust" onClick={() => setOpen(!open)}>+ Книга или цитата</button>}
    {open && !value && <div className="border border-ink/15 p-4"><LibraryBookPicker onSelect={book => { onChange({ documentId: book.id, title: book.title }); setOpen(false); }} /><div className="mt-5 border-t border-ink/10 pt-4"><label className="text-xs text-muted">Или ссылка на точную цитату из читалки<input aria-label="Ссылка на цитату" className="room-input mt-2" value={link} onChange={e => setLink(e.target.value)} /></label><button type="button" className="button-secondary mt-3" onClick={() => { try { const url = new URL(link, location.origin); const id = url.pathname.match(/^\/documents\/([^/]+)$/)?.[1]; if (url.origin !== location.origin || !id) throw new Error("Выберите ссылку на книгу этой библиотеки"); const anchor = anchorFromHash(url.hash, id); if (!anchor) throw new Error("В ссылке нет точной цитаты. Скопируйте её через «Ссылка на фрагмент» в читалке."); onChange({ documentId: id, title: "Цитата из библиотеки", anchor }); setOpen(false); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "Не удалось прочитать ссылку"); } }}>Прикрепить цитату</button>{error && <p role="alert" className="mt-3 text-sm text-rust">{error}</p>}</div></div>}
  </div>;
}
export function DiscussionSourceView({ documentId, title, anchorJson }: { documentId?: string | null; title?: string | null; anchorJson?: string | null }) {
  let anchor: TextAnchor | null = null;
  try { anchor = anchorJson ? validateAnchor(JSON.parse(anchorJson)) : null; } catch { /* Legacy data remains readable without a broken quote. */ }
  if (!anchor && !documentId) return null;
  return <div className="my-5"><PublicationContent content={{ version: 1, blocks: [anchor ? { id: "source", type: "quote", anchor, title: title || "Источник в библиотеке", comment: "" } : { id: "source", type: "book", documentId: documentId!, title: title || "Произведение в библиотеке" }] }} /></div>;
}
