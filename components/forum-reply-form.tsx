"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { AttachmentPicker, type PickedFile } from "./attachment-picker";
import { DiscussionSource, type DiscussionSourceValue } from "./discussion-source";
import { useCommentDraft } from "@/lib/use-comment-draft";
import { commentRequest, commentError } from "@/lib/comment-request";
type Draft = { body: string; files: PickedFile[]; source: DiscussionSourceValue };
const blank: Draft = { body: "", files: [], source: null };
function parse(value: string): Draft { try { return { ...blank, ...JSON.parse(value) }; } catch { return { ...blank }; } }
export function ForumReplyForm({ topicId, parentId = null, currentUserId = "session", compact = false, onDone, composeId, quote }: { topicId: string; parentId?: string | null; currentUserId?: string; compact?: boolean; onDone?: () => void; composeId?: string; quote?: string }) {
  const router = useRouter(); const [stored, setStored] = useCommentDraft(`${currentUserId}:forum:${topicId}:${parentId ?? "root"}`); const value = parse(stored);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const lock = useRef(false); const composeRef = useRef<HTMLTextAreaElement>(null);
  const patch = (part: Partial<Draft>) => setStored(old => JSON.stringify({ ...parse(old), ...part }));
  useEffect(() => {
    if (!composeId) return;
    const receive = (event: Event) => { const text = (event as CustomEvent<{ body?: string }>).detail?.body?.trim(); if (!text) return; setStored(old => { const draft = parse(old); return JSON.stringify({ ...draft, body: [draft.body, text].filter(Boolean).join("\n\n") }); }); composeRef.current?.focus(); };
    window.addEventListener("blabla:discussion-share", receive); return () => window.removeEventListener("blabla:discussion-share", receive);
  }, [composeId, setStored]);
  return <form id={composeId} className={`${compact ? "mt-5" : "mt-10 border-t border-ink/20 pt-7"} space-y-4`} onSubmit={async event => {
    event.preventDefault(); if (lock.current) return; lock.current = true; setBusy(true); setError("");
    try { const data = await commentRequest<{ id: string }>(`/api/forum/topics/${topicId}/posts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: value.body, parentId, documentId: value.source?.documentId, anchor: value.source?.anchor, attachmentIds: value.files.map(file => file.id) }) }); setStored(""); onDone?.(); router.push(`/discuss/${topicId}?post=${data.id}#comment-${data.id}`); }
    catch (e) { setError(commentError(e)); } finally { lock.current = false; setBusy(false); }
  }}>
    {!compact && <h2 className="font-serif text-2xl">Добавить свой взгляд</h2>}
    {quote && <blockquote className="line-clamp-4 border-l-2 border-ink/20 pl-4 text-sm leading-6 text-muted">{quote}</blockquote>}
    <textarea ref={composeRef} aria-label="Текст ответа" value={value.body} maxLength={8000} onChange={e => patch({ body: e.target.value })} placeholder="Продолжите мысль, задайте вопрос или приведите пример…" rows={compact ? 4 : 6} className="room-input text-base leading-7" autoFocus={compact} disabled={busy} />
    <DiscussionSource value={value.source} onChange={source => patch({ source })} />
    <div className="flex flex-wrap items-start justify-between gap-3"><AttachmentPicker files={value.files} onChange={files => patch({ files })} compact /><div className="flex gap-3">{compact && onDone && <button type="button" className="text-sm text-muted" onClick={onDone}>Отмена</button>}<button type="submit" className="button-primary" disabled={busy || (!value.body.trim() && !value.files.length && !value.source)}><Send size={14} />{busy ? "Отправляем…" : "Ответить"}</button></div></div>
    <p className="text-xs leading-5 text-muted">Черновик сохраняется в этом браузере. Личные пометки не прикрепляются к сообщению.</p>{error && <p role="alert" className="text-sm text-rust">{error}</p>}
  </form>;
}
