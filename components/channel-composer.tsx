"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, Eye, Loader2, Save, Send, X } from "lucide-react";
import { PublicationBlockEditor } from "./publication-block-editor";
import { PublicationContent } from "./publication-content";
import { contentText, parseContent, legacyDoc, type PublicationContent as Content } from "@/lib/publication-content";
import { commentError, commentRequest } from "@/lib/comment-request";

type Initial = { id: string; slug: string; title: string; body: string; contentJson: string | null; revision: number; published: number; documentId?: string | null; documentTitle?: string | null };
export function ChannelComposer({ channelId, isNews, postBase, currentUserId = "session", initialPost = null }: { channelId: string; isNews: boolean; postBase: string; currentUserId?: string; initialPost?: Initial | null }) {
  const router = useRouter();
  const starting: Content = parseContent(initialPost?.contentJson) ?? { version: 1, blocks: [{ id: "text", type: "text", doc: legacyDoc(initialPost?.body ?? "") }, ...(initialPost?.documentId ? [{ id: "book", type: "book" as const, documentId: initialPost.documentId, title: initialPost.documentTitle ?? undefined }] : [])] };
  const [value, setValue] = useState({ title: initialPost?.title ?? "", content: starting });
  const [ready, setReady] = useState(false); const [busy, setBusy] = useState(false); const [status, setStatus] = useState(""); const [error, setError] = useState(""); const [conflict, setConflict] = useState(false);
  const [postId, setPostId] = useState(initialPost?.id ?? null); const [published, setPublished] = useState(Boolean(initialPost?.published));
  const leaving = useRef(false);
  const revision = useRef(initialPost?.revision); const clientKey = useRef(""); const saving = useRef(false); const latest = useRef(value); latest.current = value;
  const lastSaved = useRef(JSON.stringify(value)); const key = useRef(`blabla:publication:${currentUserId}:${channelId}:${initialPost?.id ?? "new"}`);
  const preview = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let cancelled = false;
    clientKey.current = crypto.randomUUID();
    async function restore() {
      try {
        let draft = JSON.parse(localStorage.getItem(key.current) || "null");
        if (!initialPost && draft?.postId) {
          const response = await fetch(`/api/channels/posts/${draft.postId}`, { cache: "no-store" });
          const stored = await response.json();
          if (cancelled) return;
          if (response.ok && stored.published) {
            // Keep any unsaved buffer under its publication key, never reopen it as a new draft.
            localStorage.setItem(`blabla:publication:${currentUserId}:${channelId}:${draft.postId}`, JSON.stringify({ ...draft, published: true }));
            localStorage.removeItem(key.current); draft = null;
          } else if (response.status === 404) {
            draft = { ...draft, postId: null, revision: undefined, clientKey: crypto.randomUUID() };
          } else if (!response.ok) {
            throw new Error(stored.error || "Не удалось проверить черновик на сервере. Обновите страницу перед сохранением.");
          } else if (draft.revision && stored.revision > draft.revision) {
            setConflict(true); setError("Запись изменена в другом окне. Ваш локальный черновик сохранён; сравните версии перед продолжением.");
          }
        }
        if (cancelled) return;
        if (draft?.value?.content?.version === 1 && (!initialPost || draft.postId === initialPost.id)) {
          setValue(draft.value); clientKey.current = draft.clientKey || clientKey.current;
          if (draft.postId) setPostId(draft.postId);
          if (draft.revision) revision.current = draft.revision;
          if (draft.published || initialPost?.published) setPublished(true);
          setStatus("Восстановлен локальный черновик");
          if (initialPost && draft.revision && draft.revision < initialPost.revision) { setConflict(true); setError("На сервере есть более новая версия. Ваш черновик сохранён; сравните его с публикацией перед продолжением."); }
        }
        const quote = sessionStorage.getItem(`blabla:quote:${channelId}`);
        if (!initialPost && quote) { const block = JSON.parse(quote); setValue(v => ({ ...v, content: { version: 1, blocks: [...v.content.blocks, block] } })); sessionStorage.removeItem(`blabla:quote:${channelId}`); }
      } catch (e) { if (!cancelled) { setError(e instanceof Error ? e.message : "Не удалось восстановить черновик. Обновите страницу."); setConflict(true); } }
      if (!cancelled) setReady(true);
    }
    void restore(); return () => { cancelled = true; };
  }, [channelId, currentUserId, initialPost]);

  useEffect(() => {
    if (!ready || leaving.current || conflict) return;
    try {
      const stored = JSON.stringify({ value, postId, revision: revision.current, clientKey: clientKey.current, published });
      localStorage.setItem(key.current, stored);
      if (postId) localStorage.setItem(`blabla:publication:${currentUserId}:${channelId}:${postId}`, stored);
    } catch { setStatus("Черновик только в этом окне: хранилище браузера недоступно"); }
  }, [value, ready, postId, busy, channelId, currentUserId, published, conflict]);

  useEffect(() => {
    function warn(event: BeforeUnloadEvent) { if (JSON.stringify(latest.current) !== lastSaved.current) event.preventDefault(); }
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const save = useCallback(async (publish: boolean, leave = false) => {
    if (saving.current || conflict || !ready) return;
    saving.current = true; setBusy(true); setError("");
    const snapshot = latest.current;
    try {
      const result = await commentRequest<{ id: string; slug: string; revision: number; duplicate?: boolean }>(postId ? `/api/channels/posts/${postId}` : `/api/channels/${channelId}/posts`, {
        method: postId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...snapshot, published: publish, revision: revision.current, clientKey: clientKey.current }),
      });
      setPostId(result.id); revision.current = result.revision;
      // A retried POST can recover the original row. Apply the latest buffer using its revision.
      if (result.duplicate) {
        if (result.revision > 1) throw new Error("Запись изменена в другом окне. Ваш текст сохранён локально; обновите страницу и сравните версии.");
        const updated = await commentRequest<{ revision: number }>(`/api/channels/posts/${result.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...snapshot, published: publish, revision: result.revision }) });
        revision.current = updated.revision;
      }
      lastSaved.current = JSON.stringify(snapshot); setPublished(publish); setStatus(publish ? "Изменения опубликованы" : "Черновик сохранён");
      if (!postId) window.history.replaceState(null, "", `${postBase}/write?post=${result.id}`);
      if (leave && JSON.stringify(latest.current) === lastSaved.current) {
        leaving.current = true;
        try { localStorage.removeItem(key.current); localStorage.removeItem(`blabla:publication:${currentUserId}:${channelId}:${result.id}`); } catch { /* server copy is saved */ }
        router.push(`${postBase}/${result.slug}`);
      }
    } catch (e) { const message = commentError(e); setError(message); if (message.includes("другом окне") || message.includes("Обновите страницу редактора")) setConflict(true); setStatus("Черновик сохранён в браузере"); }
    finally { saving.current = false; setBusy(false); }
  }, [postId, channelId, postBase, currentUserId, conflict, ready, router]);

  useEffect(() => {
    if (!ready || busy || error || published || conflict || JSON.stringify(value) === lastSaved.current || !contentText(value.content)) return;
    const timer = setTimeout(() => { void save(false); }, 1800);
    return () => clearTimeout(timer);
  }, [value, ready, busy, error, published, conflict, save]);

  return <div className="mx-auto max-w-5xl">
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink/15 pb-5">
      <Link href={isNews ? "/news" : postBase} className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink"><ArrowLeft size={16} /> {isNews ? "В ленту" : "В канал"}</Link>
      <div className="flex flex-wrap items-center gap-2"><button type="button" className="button-secondary" onClick={() => preview.current?.showModal()}><Eye size={15} /> Предпросмотр</button><button type="button" className="button-secondary" disabled={busy || conflict} onClick={() => void save(published)}><Save size={15} /><span className="hidden sm:inline">Сохранить</span></button><button type="button" className="button-primary" disabled={busy || conflict || !contentText(value.content)} onClick={() => void save(true, true)}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}{published ? "Обновить" : "Опубликовать"}</button></div>
    </div>
    <div className="mt-4 flex min-h-6 flex-wrap items-center justify-between gap-2 text-xs text-muted"><span className="flex items-center gap-2" role="status">{busy ? <Loader2 size={13} className="animate-spin" /> : status ? <Check size={13} /> : null}{busy ? "Сохраняем…" : status || "Черновик виден только редакции"}</span><span>{contentText(value.content).length.toLocaleString("ru-RU")} знаков · {Math.max(1, Math.ceil(contentText(value.content).length / 1000))} мин чтения</span></div>
    {error && <div role="alert" className="mt-4 border-l-2 border-rust bg-rust/5 p-4 text-sm leading-6">{error}{conflict && <button type="button" className="mt-2 block underline" onClick={() => { const blob = new Blob([JSON.stringify(latest.current, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "publication-draft.json"; a.click(); URL.revokeObjectURL(url); }}>Скачать свой черновик для сравнения</button>}</div>}
    <div className="mx-auto max-w-[46rem] py-10 sm:py-14"><label className="sr-only" htmlFor="publication-title">Заголовок публикации</label><textarea id="publication-title" rows={2} placeholder="О чём вы хотите рассказать?" maxLength={160} className="mb-8 w-full resize-none bg-transparent font-serif text-3xl leading-tight tracking-tight outline-none placeholder:text-muted/45 sm:text-4xl" value={value.title} onChange={e => { setError(""); setValue(v => ({ ...v, title: e.target.value })); }} />
      {ready ? <PublicationBlockEditor content={value.content} onChange={content => { setError(""); setValue(v => ({ ...v, content })); }} /> : <p className="py-10 text-sm text-muted">Открываем черновик…</p>}
    </div>
    <dialog ref={preview} className="publication-dialog publication-preview"><div className="mb-8 flex items-center justify-between border-b border-ink/15 pb-4"><span className="eyebrow">Предпросмотр публикации</span><button type="button" aria-label="Закрыть предпросмотр" onClick={() => preview.current?.close()} className="p-2"><X size={20} /></button></div><article><h1 className="mb-8 font-serif text-4xl leading-tight">{value.title}</h1><PublicationContent content={value.content} /></article></dialog>
  </div>;
}
