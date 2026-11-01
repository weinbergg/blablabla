"use client";
import { useFeature } from "./feature-provider";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BookOpen, X } from "lucide-react";
import { LibraryBookPicker } from "./library-book-picker";
import { ROOM_ACCESS, ROOM_FORMATS } from "@/lib/room-types";

export type RoomForm = {
  title: string; summary: string; body: string; kind: string; accessMode: string;
  documentId: string | null; documentTitle: string | null; startsAt: string;
  seatLimit: string; meetUrl: string; status: string;
};
const blank: RoomForm = { title: "", summary: "", body: "", kind: "reading", accessMode: "open", documentId: null, documentTitle: null, startsAt: "", seatLimit: "", meetUrl: "", status: "draft" };
export function RoomEditor({ userId, id, slug, initial }: { userId: string; id?: string; slug?: string; initial?: RoomForm }) {
  const router = useRouter();
  const [value, setValue] = useState(initial ?? blank);
  const [ready, setReady] = useState(false); const [dirty, setDirty] = useState(false);
  const paidEnabled = useFeature("paid_events");
  const hostProgramsEnabled = useFeature("host_programs");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [bookOpen, setBookOpen] = useState(false);
  const key = `blabla:room-draft:${userId}:${id ?? "new"}`;
  useEffect(() => {
    try { const saved = localStorage.getItem(key); if (saved) { setValue({ ...blank, ...JSON.parse(saved) }); setDirty(true); } else { setValue(old => { if (!old.startsAt) return old; const time = new Date(old.startsAt); if (!Number.isFinite(time.getTime())) return old; return { ...old, startsAt: new Date(time.getTime() - time.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }; }); } } catch { /* Storage may be disabled. */ }
    setReady(true);
  }, [key]);
  useEffect(() => { if (ready && dirty) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { setError("Браузер не разрешил сохранить черновик. Сохраните комнату перед закрытием страницы."); } } }, [key, value, ready, dirty]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", guard); return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  const patch = (update: Partial<RoomForm>) => { setValue(old => ({ ...old, ...update })); setDirty(true); };
  async function save(status: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch(id ? `/api/seminars/${id}` : "/api/seminars", { method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...value, status, startsAt: value.startsAt ? new Date(value.startsAt).toISOString() : null }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Не удалось сохранить комнату");
      setDirty(false); try { localStorage.removeItem(key); } catch { /* no storage */ }
      router.push(`/seminars/${slug ?? data.slug}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Связь прервалась. Черновик остаётся в этом браузере."); }
    finally { setBusy(false); }
  }
  return <form className="room-editor mx-auto max-w-4xl" onSubmit={e => { e.preventDefault(); void save(value.status); }}>
    <div className="border-b border-ink/15 pb-8"><p className="eyebrow">{id ? "Настройки комнаты" : "Новое пространство для чтения"}</p>
      <label className="sr-only" htmlFor="room-title">Название комнаты</label>
      <input id="room-title" required minLength={3} maxLength={160} className="mt-4 w-full bg-transparent font-serif text-3xl leading-tight outline-none placeholder:text-muted/55 md:text-5xl" placeholder="О чём будем читать и говорить?" value={value.title} onChange={e => patch({ title: e.target.value })} />
      <label className="mt-6 block text-sm text-muted">Короткое описание<textarea className="room-input mt-2 min-h-24" maxLength={1200} placeholder="Для кого эта комната и что мы исследуем вместе" value={value.summary} onChange={e => patch({ summary: e.target.value })} /></label>
    </div>
    <div className="mt-8 grid gap-10 md:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="space-y-8">
        <section><h2 className="font-serif text-2xl">Книга на столе</h2><p className="mt-2 text-sm leading-6 text-muted">Участники смогут читать произведение и обсуждать его в одной комнате.</p>
          {value.documentId ? <div className="mt-4 flex items-center gap-3 border-y border-ink/15 py-4"><BookOpen size={22} className="shrink-0 text-rust" /><span className="min-w-0 flex-1 font-serif text-xl">{value.documentTitle}</span><button type="button" aria-label="Убрать книгу" onClick={() => patch({ documentId: null, documentTitle: null })}><X size={18} /></button></div> : <button type="button" className="button-secondary mt-4" onClick={() => setBookOpen(!bookOpen)}>Выбрать в библиотеке</button>}
          {bookOpen && !value.documentId && <LibraryBookPicker onSelect={book => { patch({ documentId: book.id, documentTitle: book.title }); setBookOpen(false); }} />}
        </section>
        <label className="block font-serif text-2xl">Программа чтения<textarea className="room-input mt-3 min-h-56 font-sans text-sm" maxLength={20000} placeholder={"Что прочитать к первой встрече?\nКакие вопросы будем обсуждать?\nКак подготовиться участникам?"} value={value.body} onChange={e => patch({ body: e.target.value })} /></label>
        <div className="grid gap-5 sm:grid-cols-2"><label className="text-sm">Первая встреча<input className="room-input mt-2" type="datetime-local" value={value.startsAt} onChange={e => patch({ startsAt: e.target.value })} /></label>
          <label className="text-sm">Количество мест<input className="room-input mt-2" type="number" min={1} max={10000} placeholder="Без ограничения" value={value.seatLimit} onChange={e => patch({ seatLimit: e.target.value })} /></label></div>
        <label className="block text-sm">Ссылка на видеовстречу <span className="text-muted">· необязательно</span><input type="url" className="room-input mt-2" placeholder="https://" value={value.meetUrl} onChange={e => patch({ meetUrl: e.target.value })} /><span className="mt-2 block text-xs leading-5 text-muted">Ссылка видна только участникам. Текстовое обсуждение работает и без созвона.</span></label>
      </div>
      <aside className="space-y-7">
        <label className="block text-sm font-medium">Формат<select className="room-input mt-2" value={value.kind} onChange={e => patch({ kind: e.target.value })}>{ROOM_FORMATS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</select></label>
        <fieldset><legend className="text-sm font-medium">Кто может присоединиться</legend><div className="mt-3 space-y-3">{ROOM_ACCESS.filter(mode => mode.id !== "paid" || value.accessMode === "paid" || (paidEnabled && hostProgramsEnabled)).map(mode => <label key={mode.id} className={`flex cursor-pointer items-start gap-3 border p-3 ${value.accessMode === mode.id ? "border-rust/50 bg-rust/5" : "border-ink/10"}`}><input className="mt-1 accent-[var(--rust)]" type="radio" name="accessMode" value={mode.id} checked={value.accessMode === mode.id} onChange={() => patch({ accessMode: mode.id })} /><span className="text-sm">{mode.label}<span className="mt-1 block text-xs leading-5 text-muted">{mode.description}</span></span></label>)}</div></fieldset>
        {id && <label className="block text-sm">Состояние<select className="room-input mt-2" value={value.status} onChange={e => patch({ status: e.target.value })}><option value="draft">Черновик</option><option value="open">Запись открыта</option><option value="closed">Запись закрыта</option><option value="done">Завершена · только чтение</option></select></label>}
      </aside>
    </div>
    {error && <p role="alert" className="mt-6 text-sm text-rust">{error}</p>}
    <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-ink/15 pt-6">
      <button disabled={busy || !ready} className="button-primary" type="submit">{busy ? "Сохраняем…" : id ? "Сохранить изменения" : "Сохранить черновик"}</button>
      {!id && <button disabled={busy || !ready || value.title.trim().length < 3} type="button" className="button-secondary" onClick={() => void save("open")}>Открыть комнату</button>}
      <Link className="text-sm text-muted hover:text-ink" href={slug ? `/seminars/${slug}` : "/seminars"}>Назад</Link>
      <span aria-live="polite" className="text-xs text-muted">{ready && dirty ? "Черновик сохранён в этом браузере" : ""}</span>
    </div>
  </form>;
}
