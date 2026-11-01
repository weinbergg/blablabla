"use client";

import { useEffect, useState } from "react";

type Overview = {
  days: number;
  metrics: { activeDay: number; activeWeek: number; activeMonth: number; bookOpens: number; returningReaders: number; channelViews: number; channelFollows: number; roomJoins: number; pricingViews: number; ticketPurchases: number; socialEventsSince: string | null };
  totalPeople: number;
  activePeople: number;
  byAction: { action: string; n: number }[];
  daily: { day: string; n: number; people: number }[];
  recent: {
    id: string;
    action: string;
    email: string | null;
    targetType: string | null;
    targetId: string | null;
    createdAt: string;
  }[];
  segments: { active7d: number; activeFree: number; activePaid: number };
};

const ACTION_LABEL: Record<string, string> = {
  "pricing.view": "просмотры тарифов",
  "channel.view": "просмотры каналов",
  "channel.follow": "подписки на каналы",
  "room.join": "вступления в комнаты",
  login: "входы",
  register: "регистрации",
  read: "чтение",
  download: "скачивания",
  "discuss.create": "новые темы",
  "discuss.reply": "ответы",
  "channel.post": "записи каналов",
  "seminar.ticket": "билеты на встречи",
  checkout: "оплаты",
  search: "поиски",
};

export function ActivityTab() {
  const [days, setDays] = useState(14);
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const abort = new AbortController(); setError(""); setData(null);
    void fetch(`/api/admin/activity?days=${days}`, { signal: abort.signal })
      .then((response) => response.json())
      .then((payload: Overview & { error?: string }) => {
        if (payload.error) setError(payload.error);
        else setData(payload);
      })
      .catch(() => { if (!abort.signal.aborted) setError("Не удалось загрузить журнал"); });
    return () => abort.abort();
  }, [days]);

  if (error) return <p className="text-sm text-rust">{error}</p>;
  if (!data) return <p className="text-sm text-muted">Считаю…</p>;

  return (
    <div className="space-y-8">
      <p className="max-w-2xl text-sm leading-6 text-muted">
        События показывают, как пользуются библиотекой. Активные читатели — уникальные аккаунты с действиями за последние 24 часа, 7 и 30 дней. Анонимные просмотры учитываются в событиях, но не в числе активных аккаунтов. Содержимое пометок, сообщений и обсуждений здесь не собирается.
      </p>

      <label className="flex flex-wrap items-center gap-3 text-sm">Период событий<select aria-label="Период аналитики" className="border border-ink/15 bg-paper px-3 py-2" value={days} onChange={e => setDays(Number(e.target.value))}>{[7,14,30,90].map(n => <option key={n} value={n}>{n} дней</option>)}</select></label>
      <div className="grid gap-3 sm:grid-cols-3"><Stat label="Активны · 24 часа" value={data.metrics.activeDay} /><Stat label="Активны · 7 дней" value={data.metrics.activeWeek} /><Stat label="Активны · 30 дней" value={data.metrics.activeMonth} /></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Stat label="Открытия книг" value={data.metrics.bookOpens} /><Stat label="Вернулись к чтению · 30 дней" value={data.metrics.returningReaders} /><Stat label="Просмотры каналов" value={data.metrics.channelViews} /><Stat label="Подписки на каналы" value={data.metrics.channelFollows} /><Stat label="Вступления в комнаты" value={data.metrics.roomJoins} /><Stat label="Просмотры тарифов" value={data.metrics.pricingViews} /><Stat label="Успешные покупки билетов" value={data.metrics.ticketPurchases} /><Stat label="Всего аккаунтов" value={data.totalPeople} /></div>
      <p className="text-xs leading-6 text-muted">Вернувшиеся читатели открывали книги минимум в два разных дня за месяц. Покупки — только подтверждённые платежи ЮKassa за читательские билеты; выдача вручную и ожидающие оплаты исключены. Даты событий приводятся в UTC. {data.metrics.socialEventsSince ? `Социальные события собираются с ${new Date(data.metrics.socialEventsSince).toLocaleDateString("ru-RU")}.` : "События социальных разделов ещё не поступили."}</p>


      <section>
        <h2 className="font-serif text-2xl tracking-tight">Что делали</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {data.byAction.map((row) => (
            <li key={row.action} className="flex justify-between border border-ink/10 px-3 py-2 text-sm">
              <span>{ACTION_LABEL[row.action] ?? row.action}</span>
              <span className="text-muted">{row.n}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-serif text-2xl tracking-tight">По дням</h2>
        <ul className="mt-3 space-y-1 text-sm">
          {data.daily.map((row) => (
            <li key={row.day} className="flex justify-between text-muted">
              <span>{row.day}</span>
              <span>
                {row.n} событий · {row.people} чел.
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-serif text-2xl tracking-tight">Последние события</h2>
        <ul className="mt-3 divide-y divide-ink/10 border border-ink/10 text-sm">
          {data.recent.map((row) => (
            <li key={row.id} className="flex flex-wrap gap-x-3 px-3 py-2">
              <span className="text-muted">{new Date(row.createdAt).toLocaleString("ru-RU")}</span>
              <span>{ACTION_LABEL[row.action] ?? row.action}</span>
              <span className="text-muted">{row.email ?? "гость"}</span>
              {row.targetId ? <span className="truncate text-muted">{row.targetId}</span> : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-ink/10 px-3 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-serif text-2xl">{value}</p>
    </div>
  );
}
