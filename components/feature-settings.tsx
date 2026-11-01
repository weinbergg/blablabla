"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FEATURES, type FeatureFlags, type FeatureMode } from "@/lib/feature-flags";
const descriptions = { channels: "Каналы, публикации и их вложения", channel_creation: "Новые каналы; существующие продолжают работать", feed: "Общая лента, подписки и сохранённые материалы", forum: "Общие обсуждения и темы книг", comments: "Комментарии к книгам и публикациям, ответы в форуме", rooms: "Чтения, занятия, переписка и материалы комнат", room_creation: "Новые комнаты; существующие продолжают работать", host_programs: "Условия программы и кабинет ведущего", paid_events: "Запись на платные мероприятия; не включает реальные выплаты ведущим", experimental: "Доступ к функциям с явной экспериментальной отметкой" };
export function FeatureSettings({ initial }: { initial: FeatureFlags }) {
  const router = useRouter(); const [modes, setModes] = useState(initial.modes); const [testers, setTesters] = useState(initial.testerIds.join("\n"));
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  return <form className="mt-10" onSubmit={async e => { e.preventDefault(); setBusy(true); setMessage(""); setError(""); try {
    const response = await fetch("/api/admin/features", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modes, testerIds: testers.split(/[\s,]+/).filter(Boolean) }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || "Не удалось сохранить настройки"); setMessage("Настройки сохранены. Новые запросы уже используют выбранные режимы."); router.refresh();
  } catch (e) { setError(e instanceof Error ? e.message : "Не удалось сохранить настройки"); } finally { setBusy(false); } }}>
    <div className="border-t border-ink/20">{FEATURES.map(f => <div key={f.id} className="grid gap-4 border-b border-ink/15 py-6 sm:grid-cols-[1fr_15rem]"><div><label htmlFor={`flag-${f.id}`} className="font-serif text-xl">{f.label}</label><p className="mt-2 text-sm leading-6 text-muted">{descriptions[f.id]}</p></div><select id={`flag-${f.id}`} className="room-input self-center" value={modes[f.id]} disabled={busy} onChange={e => { setModes({ ...modes, [f.id]: e.target.value as FeatureMode }); setMessage(""); }}><option value="on">Включено</option><option value="testers">Только тестировщики</option><option value="admins">Только администраторы</option><option value="off">Отключено</option></select></div>)}</div>
    <label className="mt-8 block text-sm font-medium" htmlFor="tester-ids">Тестировщики</label><p className="mt-2 text-sm leading-6 text-muted">ID из ссылки на профиль, по одному на строку. Администраторы тоже имеют доступ к режиму тестирования.</p><textarea id="tester-ids" className="room-input mt-3 min-h-28" value={testers} disabled={busy} onChange={e => { setTesters(e.target.value); setMessage(""); }} />
    <p className="mt-4 text-xs leading-6 text-muted">Лента и создание каналов доступны при включённых каналах. Создание комнат — при включённых читательских комнатах. Тарифы читательских билетов управляются отдельно.</p>
    {message && <p role="status" className="mt-5 text-sm">{message}</p>}{error && <p role="alert" className="mt-5 text-sm text-rust">{error}</p>}<button type="submit" disabled={busy} className="button-primary mt-6">{busy ? "Сохраняем…" : "Сохранить доступность"}</button>
  </form>;
}
