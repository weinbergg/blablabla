"use client";
import { useContext, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { TextAnchor } from "@/lib/publication-content";
import { anchorHref } from "@/lib/publication-content";
import { useFeature } from "../feature-provider";
import { RoomQuoteContext } from "./room-quote-context";
export async function anchorSource(documentId: string, fileUrl: string) {
  const token = new URL(fileUrl, window.location.origin).searchParams.get("t") ?? "";
  const response = await fetch(`/api/documents/${documentId}/anchor?t=${encodeURIComponent(token)}`);
  const data = await response.json(); if (!response.ok) throw new Error(data.error || "Не удалось проверить источник");
  return data as { title: string; textVersion: string };
}
export function QuotePublish({ anchor, fileUrl, publicationTitle }: { anchor: TextAnchor; fileUrl?: string; publicationTitle?: string }) {
  const forumEnabled = useFeature("forum");
  const channelsEnabled = useFeature("channels");
  const room = useContext(RoomQuoteContext);
  const router = useRouter(); const [open, setOpen] = useState(false); const [channels, setChannels] = useState<{ id: string; slug: string; title: string }[]>([]);
  const [comment, setComment] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [copied, setCopied] = useState(false);
  async function sourceForShare() {
    // A published quote retains its original text version. Never re-stamp it with a newer file hash.
    if (publicationTitle !== undefined) return { title: publicationTitle, textVersion: anchor.textVersion };
    if (!fileUrl) throw new Error("Не удалось проверить источник цитаты.");
    return anchorSource(anchor.documentId, fileUrl);
  }
  async function start() {
    if (open) { setOpen(false); return; }
    setOpen(true); setBusy(true); setError("");
    try { const response = await fetch("/api/channels/mine"); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Войдите, чтобы публиковать в канале."); setChannels(data.channels ?? []); }
    catch (e) { setError(e instanceof Error ? e.message : "Не удалось загрузить каналы"); } finally { setBusy(false); }
  }
  async function publish(channel: { id: string; slug: string }) {
    setBusy(true); setError("");
    try {
      const source = await sourceForShare();
      sessionStorage.setItem(`blabla:quote:${channel.id}`, JSON.stringify({ id: crypto.randomUUID(), type: "quote", anchor: { ...anchor, textVersion: source.textVersion }, title: source.title, comment }));
      router.push(`/channels/${channel.slug}/write`);
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось открыть редактор. Текст остаётся здесь."); setBusy(false); }
  }
  return <div className={publicationTitle !== undefined ? "quote-share" : "mt-3 border-t border-ink/10 pt-3"}>
    {room && publicationTitle === undefined && <div className="mb-3 flex flex-wrap gap-3"><button type="button" disabled={busy} className="text-xs font-medium text-rust" onClick={async () => { setBusy(true); try { const source = await sourceForShare(); room.quote({ ...anchor, textVersion: source.textVersion }); } catch (e) { setError(e instanceof Error ? e.message : "Не удалось прикрепить цитату"); } finally { setBusy(false); } }}>Обсудить в комнате</button>{room.guide && <button type="button" disabled={busy} className="text-xs text-muted" onClick={async () => { setBusy(true); try { const source = await sourceForShare(); await room.guide?.({ ...anchor, textVersion: source.textVersion }); } catch (e) { setError(e instanceof Error ? e.message : "Не удалось выбрать фрагмент"); } finally { setBusy(false); } }}>Выбрать для общего чтения</button>}</div>}
    <div className="flex flex-wrap gap-3">{forumEnabled && publicationTitle === undefined && <button type="button" disabled={busy} className="text-xs font-medium text-rust" onClick={async () => { setBusy(true); setError(""); try { const source = await sourceForShare(); sessionStorage.setItem("blabla:discussion-quote", JSON.stringify({ documentId: anchor.documentId, title: source.title, anchor: { ...anchor, textVersion: source.textVersion } })); router.push(`/discuss/new?documentId=${encodeURIComponent(anchor.documentId)}`); } catch (e) { setError(e instanceof Error ? e.message : "Не удалось открыть обсуждение"); setBusy(false); } }}>Обсудить книгу</button>}{channelsEnabled && <button type="button" className="inline-flex min-h-10 items-center text-xs font-medium text-rust" aria-expanded={open} onClick={() => void start()}>{publicationTitle !== undefined ? "В свой канал" : "Цитировать в канале"}</button>}{publicationTitle === undefined && <button type="button" className="text-xs text-muted" onClick={async () => { try { const source = await sourceForShare(); await navigator.clipboard.writeText(location.origin + anchorHref({ ...anchor, textVersion: source.textVersion })); setCopied(true); } catch { setError("Не удалось скопировать ссылку. Попробуйте ещё раз."); } }}>{copied ? "Ссылка скопирована" : "Ссылка на фрагмент"}</button>}</div>
    {open && <div className="mt-3 space-y-3"><label className="block text-xs text-muted">Ваш комментарий<textarea aria-label="Комментарий к цитате" value={comment} onChange={e => setComment(e.target.value)} className="room-input mt-2 min-h-20" maxLength={4000} /></label><p className="text-xs leading-5 text-muted">Выберите канал. Цитата откроется в редакторе для проверки перед публикацией.</p>{busy ? <p role="status" className="text-xs">Загружаем…</p> : channels.length ? channels.map(channel => <button key={channel.id} type="button" className="block w-full border-b border-ink/10 py-2 text-left text-sm hover:text-rust" onClick={() => void publish(channel)}>{channel.title} →</button>) : !error && <Link href="/channels" className="text-xs text-rust">Сначала создайте свой канал →</Link>}</div>}
    {error && <p role="alert" className="mt-2 text-xs leading-5 text-rust">{error}</p>}
  </div>;
}
