"use client";
import { useState } from "react";
import Link from "next/link";
import { AttachmentPicker, type PickedFile } from "./attachment-picker";
import type { RoomRights } from "@/lib/room-access";
export type RoomPerson = { id: string; name: string; role: string; status: string };
export type RoomMeeting = { id: string; title: string; startsAt: string; notes: string; status: string };
export type RoomFile = { id: string; name: string; kind: string };
export async function roomRequest<T = Record<string, unknown>>(id: string, path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/api/seminars/${id}${path}`, { method, cache: "no-store", headers: body === undefined ? {} : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || "Не удалось выполнить действие. Попробуйте ещё раз.");
  return data;
}
export function RoomTools({ id, rights, tab, people, meetings, files, refresh }: { id: string; rights: RoomRights; tab: string; people: RoomPerson[]; meetings: RoomMeeting[]; files: RoomFile[]; refresh: () => Promise<void> }) {
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [name, setName] = useState(""); const [invitation, setInvitation] = useState(""); const [copied, setCopied] = useState(false);
  const [uploads, setUploads] = useState<PickedFile[]>([]); const [meeting, setMeeting] = useState({ title: "", startsAt: "", notes: "" });
  async function run(action: () => Promise<void>) { setBusy(true); setError(""); try { await action(); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : "Связь прервалась"); } finally { setBusy(false); } }
  return <div className="space-y-6 p-5">
    {error && <p role="alert" className="text-sm leading-6 text-rust">{error}</p>}
    {tab === "people" && <>
      <div><p className="eyebrow">За общим столом · {people.filter(p => p.status === "member").length}</p><ul className="mt-4 divide-y divide-ink/10">{people.map(person => <li key={person.id} className="py-3">
        <div className="flex items-start justify-between gap-2"><Link href={`/users/${person.id}`} className="text-sm font-medium hover:text-rust">{person.name}</Link><span className="text-xs text-muted">{person.status === "invited" ? "Приглашён" : person.status === "banned" ? "Доступ закрыт" : person.role === "moderator" ? "Модератор" : "Участник"}</span></div>
        {rights.host && <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
          {person.status === "invited" && <button disabled={busy} onClick={() => void run(async () => { await roomRequest(id, "/members", "POST", { userId: person.id, action: "grant" }); })}>Дать доступ</button>}
          {person.status === "member" && <button disabled={busy} onClick={() => void run(async () => { await roomRequest(id, "/members", "POST", { userId: person.id, action: person.role === "moderator" ? "member" : "moderator" }); })}>{person.role === "moderator" ? "Снять модерацию" : "Назначить модератором"}</button>}
          <button disabled={busy} className="hover:text-rust" onClick={() => { if (window.confirm(person.status === "banned" ? `Вернуть доступ для ${person.name}?` : `Закрыть доступ для ${person.name}? Сообщения сохранятся.`)) void run(async () => { await roomRequest(id, "/members", "POST", { userId: person.id, action: person.status === "banned" ? "grant" : "ban" }); }); }}>{person.status === "banned" ? "Вернуть доступ" : "Закрыть доступ"}</button>
        </div>}
      </li>)}</ul>{!people.length && <p className="mt-4 text-sm leading-6 text-muted">Участники появятся здесь после вступления. Пригласите первых собеседников.</p>}</div>
      {rights.host && <form className="border-t border-ink/15 pt-5" onSubmit={e => { e.preventDefault(); void run(async () => { const match = name.match(/\/users\/([^/?#]+)/); await roomRequest(id, "/members", "POST", match ? { userId: match[1], action: "invite" } : { name, action: "invite" }); setName(""); }); }}>
        <label className="text-sm font-medium">Пригласить читателя<input required className="room-input mt-2" placeholder="Точное имя или ссылка на профиль" value={name} onChange={e => setName(e.target.value)} /></label>
        <p className="mt-2 text-xs leading-5 text-muted">Комната появится у читателя во вкладке «Мои комнаты».</p><button disabled={busy} className="button-secondary mt-3">Пригласить</button>
        {rights.mode === "invite" && <div className="mt-5"><button disabled={busy} type="button" className="text-sm text-rust underline underline-offset-4" onClick={() => void run(async () => { if (invitation && !window.confirm("Создать новую ссылку? Предыдущая перестанет действовать.")) return; const data = await roomRequest<{ path: string }>(id, "/members", "POST", { action: "invite-link" }); setInvitation(location.origin + data.path); setCopied(false); })}>Создать ссылку приглашения</button>
          {invitation && <div className="mt-3"><input readOnly aria-label="Ссылка приглашения" className="room-input text-xs" value={invitation} onFocus={e => e.target.select()} /><button type="button" className="mt-2 text-sm" onClick={async () => { try { await navigator.clipboard.writeText(invitation); setCopied(true); } catch { setError("Выделите и скопируйте ссылку в поле выше."); } }}>{copied ? "Скопировано" : "Копировать ссылку"}</button></div>}
        </div>}
      </form>}
    </>}
    {tab === "materials" && <><p className="eyebrow">Полка комнаты</p>{files.length ? <ul className="divide-y divide-ink/10">{files.map(file => <li key={file.id} className="py-3"><a href={`/api/community/files/${file.id}`} target="_blank" rel="noreferrer" className="break-words text-sm hover:text-rust">{file.name} ↗</a><span className="mt-1 block text-xs text-muted">{file.kind === "image" ? "Изображение" : file.kind === "video" ? "Видео" : "Материал"}</span></li>)}</ul> : <p className="text-sm leading-6 text-muted">Здесь будут дополнительные тексты, изображения и записи встреч.</p>}
      {rights.host && <div className="space-y-3 border-t border-ink/15 pt-5"><AttachmentPicker files={uploads} onChange={setUploads} /><button className="button-primary" disabled={busy || !uploads.length} onClick={() => void run(async () => { await roomRequest(id, "/materials", "POST", { ids: uploads.map(f => f.id) }); setUploads([]); })}>Добавить на полку</button><p className="text-xs leading-5 text-muted">Материалы доступны только участникам этой комнаты.</p></div>}
    </>}
    {tab === "schedule" && <><p className="eyebrow">Встречи и записи</p>{meetings.length ? <ol className="space-y-6">{meetings.map(item => <li key={item.id} className="border-l-2 border-rust/35 pl-4">
      <p className="text-xs text-muted">{new Date(item.startsAt).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</p><h3 className="mt-1 font-serif text-xl">{item.title}</h3><p className="mt-1 text-xs text-muted">{item.status === "done" ? "Состоялась" : item.status === "cancelled" ? "Отменена" : "Запланирована"}</p>{item.notes && <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{item.notes}</p>}
      {rights.host && item.status === "scheduled" && <div className="mt-3 flex gap-3 text-xs text-muted">{[["done", "Завершить"], ["cancelled", "Отменить"]].map(([status, label]) => <button key={status} disabled={busy} onClick={() => { if (window.confirm(`${label} встречу «${item.title}»?`)) void run(async () => { await roomRequest(id, "/meetings", "POST", { ...item, status }); }); }}>{label}</button>)}</div>}
    </li>)}</ol> : <p className="text-sm leading-6 text-muted">Ведущий ещё не назначил встречи. Пока можно читать и обсуждать книгу в своём темпе.</p>}
      {rights.host && <form className="space-y-3 border-t border-ink/15 pt-5" onSubmit={e => { e.preventDefault(); void run(async () => { await roomRequest(id, "/meetings", "POST", { ...meeting, startsAt: new Date(meeting.startsAt).toISOString() }); setMeeting({ title: "", startsAt: "", notes: "" }); }); }}>
        <p className="text-sm font-medium">Назначить встречу</p><input required maxLength={160} aria-label="Название встречи" placeholder="Название встречи" className="room-input" value={meeting.title} onChange={e => setMeeting({ ...meeting, title: e.target.value })} /><input required aria-label="Время встречи" type="datetime-local" className="room-input" value={meeting.startsAt} onChange={e => setMeeting({ ...meeting, startsAt: e.target.value })} /><textarea className="room-input min-h-24" aria-label="Подготовка к встрече" placeholder="Что прочитать к встрече" maxLength={8000} value={meeting.notes} onChange={e => setMeeting({ ...meeting, notes: e.target.value })} /><button className="button-secondary" disabled={busy}>Добавить встречу</button>
      </form>}
    </>}
  </div>;
}
