"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, BookOpen, PanelRightClose, PanelRightOpen, Send, Settings, X } from "lucide-react";
import type { RoomRights } from "@/lib/room-access";
import { validateAnchor, type TextAnchor } from "@/lib/publication-content";
import { anchorHref } from "./publication-content";
import { RoomQuoteContext } from "./readers/room-quote-context";
import type { AnnotationItem } from "./readers/annotation-layer";
import { RoomTools, roomRequest, type RoomFile, type RoomMeeting, type RoomPerson } from "./room-tools";

const loading = () => <p className="p-10 text-sm text-muted" role="status">Открываем книгу…</p>;
const PdfReader = dynamic(() => import("./readers/pdf-reader").then(m => m.PdfReader), { ssr: false, loading });
const EpubReader = dynamic(() => import("./readers/epub-reader").then(m => m.EpubReader), { ssr: false, loading });
const TxtReader = dynamic(() => import("./readers/txt-reader").then(m => m.TxtReader), { ssr: false, loading });
type Position = { documentId: string; page: number; updatedAt: string; anchor?: TextAnchor | null };
type Message = { id: string; seq: number; authorId: string; authorName: string; body: string; createdAt: string; parentId: string | null; kind: string; anchorJson: string | null; deletedAt: string | null };
export type WorkspaceRoom = { id: string; slug: string; title: string; hostName: string | null; hostUserId: string | null; documentId: string | null; documentTitle: string | null; documentType: string | null; language: string | null; body: string; summary: string | null; meetUrl: string | null; discussionLocked: number };
const tabs = [["chat", "Разговор"], ["questions", "Вопросы"], ["people", "Участники"], ["materials", "Материалы"], ["schedule", "Встречи"]] as const;

export function RoomWorkspace({ room, initialRights, currentUserId, fileUrl, canAnnotate }: { room: WorkspaceRoom; initialRights: RoomRights; currentUserId: string; fileUrl: string | null; canAnnotate: boolean }) {
  const [rights, setRights] = useState(initialRights); const [page, setPage] = useState(1); const [total, setTotal] = useState(1);
  const [locked, setLocked] = useState(!!room.discussionLocked);
  const [panel, setPanel] = useState(true); const [tab, setTab] = useState("chat"); const [follow, setFollow] = useState(false);
  const [position, setPosition] = useState<Position | null>(null); const [messages, setMessages] = useState<Message[]>([]);
  const [people, setPeople] = useState<RoomPerson[]>([]); const [meetings, setMeetings] = useState<RoomMeeting[]>([]); const [files, setFiles] = useState<RoomFile[]>([]);
  const [body, setBody] = useState(""); const [kind, setKind] = useState("message"); const [reply, setReply] = useState<Message | null>(null);
  const [quotedAnchor, setQuotedAnchor] = useState<TextAnchor | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [syncError, setSyncError] = useState("");
  const [ready, setReady] = useState(false); const [more, setMore] = useState(false); const [denied, setDenied] = useState(false);
  const [annotations, setAnnotations] = useState<AnnotationItem[]>([]);
  const cursor = useRef(0); const followRef = useRef(false); const positionTime = useRef("");
  const chat = useRef<HTMLDivElement>(null); const nearEnd = useRef(true); const draftKey = `blabla:room-message:${currentUserId}:${room.id}`;
  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey) ?? "";
      let draft: { version?: number; body?: string; anchor?: unknown } | null = null;
      try { draft = JSON.parse(saved); } catch { /* Existing plain-text draft. */ }
      if (draft?.version === 1 && typeof draft.body === "string") {
        setBody(draft.body);
        if (draft.anchor) { try { const anchor = validateAnchor(draft.anchor); if (anchor.documentId === room.documentId) setQuotedAnchor(anchor); } catch { /* Keep the text even if its source is invalid. */ } }
      } else setBody(saved);
    } catch { /* no storage */ }
    setReady(true);
  }, [draftKey, room.documentId]);
  useEffect(() => { if (ready) { try { if (body || quotedAnchor) localStorage.setItem(draftKey, JSON.stringify({ version: 1, body, anchor: quotedAnchor })); else localStorage.removeItem(draftKey); } catch { /* Text remains in the form. */ } } }, [body, quotedAnchor, ready, draftKey]);
  useEffect(() => {
    if (!room.documentId) return;
    const abort = new AbortController();
    fetch(`/api/documents/${room.documentId}/annotations?tier=pins`, { signal: abort.signal }).then(r => r.ok ? r.json() : null).then(data => { if (data) setAnnotations(data.items ?? []); }).catch(() => {});
    return () => abort.abort();
  }, [room.documentId]);
  const refresh = useCallback(async () => {
    const [details, material] = await Promise.all([roomRequest<{ rights: RoomRights; people: RoomPerson[]; meetings: RoomMeeting[] }>(room.id, ""), roomRequest<{ files: RoomFile[] }>(room.id, "/materials")]);
    setRights(details.rights); setPeople(details.people); setMeetings(details.meetings); setFiles(material.files);
  }, [room.id]);
  useEffect(() => { void refresh().catch(e => setError(e.message)); }, [refresh]);
  useEffect(() => {
    const abort = new AbortController(); let timer: ReturnType<typeof setTimeout>; let first = true;
    async function poll() {
      try {
        const [messageResponse, positionResponse] = await Promise.all([fetch(`/api/seminars/${room.id}/messages`, { signal: abort.signal, cache: "no-store" }), fetch(`/api/seminars/${room.id}/position`, { signal: abort.signal, cache: "no-store" })]);
        if ([messageResponse.status, positionResponse.status].some(code => code === 401 || code === 403 || code === 404)) { setDenied(true); return; }
        if (!messageResponse.ok || !positionResponse.ok) throw new Error("Обновление задерживается. Переподключаемся…");
        const data = await messageResponse.json(); const state = await positionResponse.json();
        if (abort.signal.aborted) return;
        setMessages(old => { const map = new Map(old.map(m => [m.id, m])); for (const message of data.messages as Message[]) map.set(message.id, message); return [...map.values()].sort((a, b) => a.seq - b.seq); });
        if (first) { setMore(data.hasMore); first = false; }
        for (const message of data.messages as Message[]) cursor.current = Math.max(cursor.current, message.seq);
        setPosition(state.position); setLocked(state.locked); setRights(old => ({ ...old, write: old.read && state.status !== "done" && (old.manage || !state.locked) }));
        if (state.position?.updatedAt !== positionTime.current) { positionTime.current = state.position?.updatedAt ?? ""; if (followRef.current && state.position?.documentId === room.documentId) { setPage(state.position.page); if (state.position.anchor) window.dispatchEvent(new CustomEvent("blabla:open-anchor", { detail: state.position.anchor })); } }
        setSyncError("");
      } catch (e) { if (!abort.signal.aborted) setSyncError(e instanceof Error ? e.message : "Соединение прервалось"); }
      finally { if (!abort.signal.aborted) timer = setTimeout(poll, 3000); }
    }
    void poll(); return () => { abort.abort(); clearTimeout(timer); };
  }, [room.id, room.documentId]);
  useEffect(() => { if (nearEnd.current && chat.current) chat.current.scrollTop = chat.current.scrollHeight; }, [messages, tab]);
  async function action(fn: () => Promise<void>) { setBusy(true); setError(""); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Не удалось связаться с сервером"); } finally { setBusy(false); } }
  async function send() {
    const sentBody = body;
    await action(async () => {
      await roomRequest(room.id, "/messages", "POST", { body: sentBody, kind: tab === "questions" ? "question" : kind, parentId: reply?.id, anchor: quotedAnchor });
      setBody(old => old === sentBody ? "" : old); setReply(null); setQuotedAnchor(null); nearEnd.current = true;
      const data = await roomRequest<{ messages: Message[] }>(room.id, `/messages?after=${cursor.current}`);
      setMessages(old => [...new Map([...old, ...data.messages].map(m => [m.id, m])).values()].sort((a, b) => a.seq - b.seq));
      for (const message of data.messages) cursor.current = Math.max(cursor.current, message.seq);
    });
  }
  function goToHost() { if (position?.documentId === room.documentId) { setPage(position.page); if (position.anchor) window.dispatchEvent(new CustomEvent("blabla:open-anchor", { detail: position.anchor })); } }
  function changePage(next: number, count: number) { setPage(next); setTotal(count); }
  const readerProps = { url: fileUrl ?? "", documentId: room.documentId ?? undefined, currentUserId, page, onPageChange: changePage, initialAnnotations: annotations, onAnnotationsChange: setAnnotations, canAnnotate, language: room.language, compact: true };
  const visible = tab === "questions" ? messages.filter(m => m.kind === "question" || messages.some(parent => parent.id === m.parentId && parent.kind === "question")) : messages;
  const guidance = [...messages].reverse().find(m => m.kind === "guidance" && !m.deletedAt);
  if (denied) return <main className="shell py-20"><p className="eyebrow">Доступ изменился</p><h1 className="mt-4 font-serif text-4xl">Комната сейчас недоступна</h1><p className="mt-5 text-muted">Войдите снова или обратитесь к ведущему за приглашением. Ваш черновик сообщения сохранён в этом браузере.</p><Link className="button-secondary mt-6" href={`/seminars/${room.slug}`}>Вернуться к описанию</Link></main>;
  return <main className="room-workspace">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/15 px-4 py-4 md:px-7">
      <div className="flex min-w-0 items-center gap-3"><Link href={`/seminars/${room.slug}`} aria-label="К описанию комнаты" className="shrink-0 p-2 text-muted hover:text-ink"><ArrowLeft size={20} /></Link><div className="min-w-0"><p className="text-[10px] uppercase tracking-[.16em] text-muted">Читаем вместе · {room.hostName || "Blabla"}</p><h1 className="mt-1 font-serif text-xl leading-snug md:text-2xl">{room.title}</h1></div></div>
      <div className="flex items-center gap-2">{rights.host && <Link href={`/seminars/${room.slug}/settings`} className="p-2 text-muted hover:text-ink" aria-label="Настройки комнаты"><Settings size={18} /></Link>}<button className="button-secondary !min-h-9 !px-3 !py-2 text-xs" aria-expanded={panel} onClick={() => setPanel(!panel)}>{panel ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}{panel ? "Скрыть панель" : "Открыть панель"}</button></div>
    </header>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 bg-rust/[.035] px-4 py-3 md:px-7">
      <p className="text-xs leading-5 text-muted">{position ? `Ведущий на странице ${position.page}` : "Ведущий ещё не выбрал фрагмент"}{total > 1 && ` · Вы: ${page} из ${total}`}</p>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {rights.host ? <button disabled={busy || !room.documentId} className="font-medium text-rust" onClick={() => void action(async () => { const data = await roomRequest<{ position: Position }>(room.id, "/position", "PUT", { documentId: room.documentId, page }); setPosition(data.position); })}>Обсуждаем эту страницу</button> : <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={follow} onChange={e => { followRef.current = e.target.checked; setFollow(e.target.checked); if (e.target.checked) goToHost(); }} className="accent-[var(--rust)]" />Следовать за ведущим</label>}
        <button disabled={!position} className="underline decoration-ink/25 underline-offset-4 disabled:opacity-40" onClick={goToHost}>К фрагменту ведущего</button>
      </div>
    </div>
    {syncError && <p role="status" className="border-b border-rust/15 px-5 py-2 text-xs text-rust">{syncError}</p>}
    <div className={`room-columns ${panel ? "room-columns-open" : ""}`}>
      <RoomQuoteContext.Provider value={{ quote: anchor => { setQuotedAnchor(anchor); setPanel(true); setTab("chat"); document.getElementById("room-message-body")?.focus(); }, guide: rights.host ? async anchor => { const data = await roomRequest<{ position: Position }>(room.id, "/position", "PUT", { documentId: room.documentId, page: anchor.page, anchor }); setPosition(data.position); } : undefined }}>
      <section className="min-w-0 overflow-hidden" aria-label="Книга">
        {guidance && <div className="flex items-start gap-3 border-b border-rust/15 px-5 py-4"><span className="shrink-0 text-xs font-medium text-rust">От ведущего</span><p className="min-w-0 whitespace-pre-wrap break-words text-sm leading-6">{guidance.body}</p></div>}
        {fileUrl && room.documentType ? room.documentType.toLowerCase() === "pdf" ? <PdfReader {...readerProps} /> : room.documentType.toLowerCase() === "epub" ? <EpubReader {...readerProps} /> : <TxtReader {...readerProps} /> : <div className="mx-auto max-w-xl px-6 py-16"><BookOpen className="text-rust" size={32} /><h2 className="mt-6 font-serif text-3xl">{room.documentId ? "Текст пока недоступен" : "Стол для разговора"}</h2><p className="mt-4 whitespace-pre-wrap text-base leading-8 text-muted">{room.body || room.summary || "Здесь можно обсудить программу, познакомиться и подготовиться к встрече."}</p>{rights.host && <Link href={`/seminars/${room.slug}/settings`} className="button-secondary mt-6">Выбрать книгу</Link>}</div>}
      </section>
      </RoomQuoteContext.Provider>
      {panel && <aside className="room-side border-ink/15" aria-label="Обсуждение и участники">
        <nav aria-label="Разделы комнаты" className="flex flex-wrap gap-x-4 border-b border-ink/15 px-4">{tabs.map(([key, label]) => <button key={key} className={`border-b-2 py-4 text-xs ${tab === key ? "border-rust font-medium text-ink" : "border-transparent text-muted hover:text-ink"}`} onClick={() => setTab(key)}>{label}</button>)}</nav>
        {tab === "chat" || tab === "questions" ? <>
          <div ref={chat} className="room-chat space-y-5 overflow-y-auto px-5 py-5" onScroll={e => { const el = e.currentTarget; nearEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100; }}>
            {more && <button className="w-full text-xs text-muted underline" disabled={busy} onClick={() => void action(async () => { nearEnd.current = false; const data = await roomRequest<{ messages: Message[]; hasMore: boolean }>(room.id, `/messages?before=${messages[0]?.seq ?? 0}`); setMessages(old => [...new Map([...data.messages, ...old].map(m => [m.id, m])).values()].sort((a, b) => a.seq - b.seq)); setMore(data.hasMore); })}>Показать предыдущие сообщения</button>}
            {!visible.length && <div className="py-10"><p className="font-serif text-2xl">{tab === "questions" ? "Вопросы открывают разговор" : "С чего начнём?"}</p><p className="mt-3 text-sm leading-7 text-muted">{tab === "questions" ? "Задайте вопрос ведущему о тексте или предстоящей встрече." : "Поделитесь первым впечатлением о книге. Сообщения видят участники комнаты."}</p></div>}
            {visible.map(message => <article key={message.id} id={`room-message-${message.id}`} className={`scroll-mt-4 ${message.kind === "guidance" ? "border-l-2 border-rust pl-3" : ""}`}>
              <div className="flex items-baseline justify-between gap-2"><Link href={`/users/${message.authorId}`} className="text-xs font-medium hover:text-rust">{message.authorName}{message.authorId === room.hostUserId && <span className="ml-2 font-normal text-rust">ведущий</span>}</Link><time className="shrink-0 text-[10px] text-muted" dateTime={message.createdAt}>{new Date(message.createdAt.replace(" ", "T") + (message.createdAt.includes("Z") ? "" : "Z")).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</time></div>
              {message.parentId && <a className="mt-2 block border-l border-ink/20 pl-2 text-xs text-muted" href={`#room-message-${message.parentId}`}>{messages.find(m => m.id === message.parentId)?.body.slice(0, 100) || "К исходному сообщению"}</a>}
              {message.anchorJson && (() => { try { const anchor = JSON.parse(message.anchorJson); return <Link className="mt-2 block border-l-2 border-rust/40 pl-3 font-serif text-base" href={anchorHref(anchor)} onClick={e => { if (anchor.documentId !== room.documentId || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); setPage(anchor.page); window.dispatchEvent(new CustomEvent("blabla:open-anchor", { detail: anchor })); document.querySelector('[aria-label="Книга"]')?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>«{anchor.exact}» ↗</Link>; } catch { return null; } })()}
              <p className={`mt-2 whitespace-pre-wrap break-words text-sm leading-7 ${message.deletedAt ? "italic text-muted" : ""}`}>{message.body}</p>
              {!message.deletedAt && <div className="mt-2 flex gap-3 text-[11px] text-muted">{rights.write && <button onClick={() => { setReply(message); document.getElementById("room-message-body")?.focus(); }}>Ответить</button>}{(rights.manage || message.authorId === currentUserId) && <button onClick={() => { if (window.confirm("Удалить сообщение из обсуждения?")) void action(async () => { await roomRequest(room.id, "/messages", "DELETE", { id: message.id }); setMessages(old => old.map(m => m.id === message.id ? { ...m, body: "Сообщение удалено", anchorJson: null, deletedAt: new Date().toISOString() } : m)); }); }}>Удалить</button>}</div>}
            </article>)}
          </div>
          <div className="border-t border-ink/15 p-4">
            {error && <p role="alert" className="mb-3 text-xs leading-5 text-rust">{error}</p>}
            {reply && <div className="mb-3 flex items-start justify-between gap-3 text-xs text-muted"><span>Ответ {reply.authorName}: {reply.body.slice(0, 90)}</span><button aria-label="Отменить ответ" onClick={() => setReply(null)}><X size={15} /></button></div>}
            {quotedAnchor && <div className="mb-3 flex items-start gap-2 border-l-2 border-rust/40 pl-3"><p className="line-clamp-3 flex-1 font-serif text-sm">«{quotedAnchor.exact}»</p><button aria-label="Убрать цитату" onClick={() => setQuotedAnchor(null)}><X size={15} /></button></div>}
            {rights.write ? <form onSubmit={e => { e.preventDefault(); void send(); }}><textarea id="room-message-body" aria-label={tab === "questions" ? "Вопрос ведущему" : "Сообщение в комнату"} className="room-input min-h-24 resize-y text-sm" maxLength={8000} placeholder={tab === "questions" ? "О чём хотите спросить?" : "Ваше прочтение…"} value={body} onChange={e => setBody(e.target.value)} /><div className="mt-3 flex items-center justify-between gap-2">{rights.host && tab !== "questions" ? <select aria-label="Тип сообщения" className="min-w-0 bg-transparent text-xs" value={kind} onChange={e => setKind(e.target.value)}><option value="message">Сообщение</option><option value="guidance">Указание ведущего</option></select> : <span className="text-[10px] text-muted">Видно участникам</span>}<button disabled={busy || !body.trim()} aria-label="Отправить сообщение" className="button-primary !min-h-9 !px-3 !py-2 text-xs"><Send size={14} />Отправить</button></div></form> : <p className="text-sm leading-6 text-muted">Обсуждение закрыто для новых сообщений. Можно продолжить чтение.</p>}
            {rights.host && <button className="mt-4 text-xs text-muted underline underline-offset-4" disabled={busy} onClick={() => void action(async () => { await roomRequest(room.id, "", "PATCH", { discussionLocked: !locked }); setLocked(!locked); await refresh(); })}>{!locked ? "Приостановить обсуждение" : "Открыть обсуждение"}</button>}
          </div>
        </> : <div className="room-chat overflow-y-auto"><RoomTools id={room.id} rights={rights} tab={tab} people={people} meetings={meetings} files={files} refresh={refresh} /></div>}
        {room.meetUrl && <a href={room.meetUrl} target="_blank" rel="noreferrer" className="border-t border-ink/15 px-5 py-4 text-sm text-rust">Открыть видеовстречу ↗</a>}
      </aside>}
    </div>
  </main>;
}
