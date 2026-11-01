"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AttachmentPicker, type PickedFile } from "./attachment-picker";
import { DiscussionSource, type DiscussionSourceValue } from "./discussion-source";
import { useCommentDraft } from "@/lib/use-comment-draft";
import { commentRequest, commentError } from "@/lib/comment-request";
import { FORUM_CATEGORIES } from "@/lib/forum-meta";
type Draft = { title: string; body: string; category: string; files: PickedFile[]; source: DiscussionSourceValue; watch: boolean };
export function ForumTopicForm({ documentId, documentTitle, currentUserId = "session" }: { documentId?: string | null; documentTitle?: string | null; currentUserId?: string }) {
  const router = useRouter(); const [stored, setStored] = useCommentDraft(`${currentUserId}:forum:new:${documentId ?? "general"}`);
  const initial: Draft = { title: documentTitle ? `О тексте: ${documentTitle.slice(0, 80)}` : "", body: "", category: documentId ? "reading" : "general", files: [], source: documentId ? { documentId, title: documentTitle || "Произведение в библиотеке" } : null, watch: true };
  const parse = (value: string): Draft => { try { return { ...initial, ...JSON.parse(value) }; } catch { return initial; } };
  const value = parse(stored); const patch = (part: Partial<Draft>) => setStored(JSON.stringify({ ...value, ...part }));
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const lock = useRef(false);
  useEffect(() => {
    try { const saved = sessionStorage.getItem("blabla:discussion-quote"); if (!saved) return; const source = JSON.parse(saved); if (documentId && source.documentId !== documentId) return; setStored(old => { let draft; try { draft = JSON.parse(old); } catch { draft = {}; } return JSON.stringify({ ...draft, source }); }); sessionStorage.removeItem("blabla:discussion-quote"); } catch { /* Keep ordinary form usable if storage is unavailable. */ }
  }, [documentId, setStored]);
  return <form className="space-y-6" onSubmit={async event => {
    event.preventDefault(); if (lock.current) return; lock.current = true; setBusy(true); setError("");
    try { const data = await commentRequest<{ id: string }>("/api/forum/topics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: value.title, body: value.body, category: value.category, documentId: value.source?.documentId, anchor: value.source?.anchor, attachmentIds: value.files.map(file => file.id), watch: value.watch }) }); setStored(""); router.push(`/discuss/${data.id}`); }
    catch (e) { setError(commentError(e)); } finally { lock.current = false; setBusy(false); }
  }}>
    <label className="block text-sm">Название темы<input aria-label="Название темы" required minLength={3} maxLength={160} className="room-input mt-2 font-serif text-2xl" placeholder="Какой вопрос вы хотите обсудить?" value={value.title} onChange={e => patch({ title: e.target.value })} /></label>
    <label className="block text-sm">Раздел<select aria-label="Раздел" className="room-input mt-2" value={value.category} onChange={e => patch({ category: e.target.value })}>{FORUM_CATEGORIES.map(item => <option key={item.slug} value={item.slug}>{item.label}</option>)}</select></label>
    <label className="block text-sm">Начало разговора<textarea aria-label="Начало разговора" required minLength={3} maxLength={8000} className="room-input mt-2 min-h-48 text-base leading-8" placeholder="Дайте контекст, сформулируйте мысль и пригласите других к обсуждению." value={value.body} onChange={e => patch({ body: e.target.value })} /></label>
    <DiscussionSource value={value.source} onChange={source => patch({ source })} /><AttachmentPicker files={value.files} onChange={files => patch({ files })} compact />
    <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={value.watch} onChange={e => patch({ watch: e.target.checked })} /><span>Следить за ответами<span className="mt-1 block text-xs leading-5 text-muted">Новые сообщения появятся в разделе «Мои подписки» и рядом с обсуждениями в меню.</span></span></label>
    {error && <p role="alert" className="text-sm text-rust">{error}</p>}<div className="flex flex-wrap items-center gap-4"><button type="submit" disabled={busy} className="button-primary">{busy ? "Открываем…" : "Открыть тему"}</button><span className="text-xs text-muted">Черновик сохраняется в этом браузере</span></div>
  </form>;
}
