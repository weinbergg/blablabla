"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { formatMoney, kopeksToRubles } from "@/lib/money";

type Seminar = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  body: string;
  location: string | null;
  startsAt: string | null;
  priceKopeks: number;
  discountPercent: number;
  seatLimit: number | null;
  status: "draft" | "open" | "closed" | "done";
  seatsTaken: number;
};

type Campaign = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  body: string;
  goalKopeks: number;
  documentId: string | null;
  status: "draft" | "open" | "funded" | "closed";
  raisedKopeks: number;
  backerCount: number;
};

const SEMINAR_STATUS = ["draft", "open", "closed", "done"] as const;
const CAMPAIGN_STATUS = ["draft", "open", "funded", "closed"] as const;
const STATUS_LABEL: Record<string, string> = {
  draft: "черновик",
  open: "открыто",
  closed: "закрыто",
  done: "прошло",
  funded: "собрано",
};

export function EventsTab() {
  const [seminars, setSeminars] = useState<Seminar[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/events");
    const data = (await response.json().catch(() => ({}))) as {
      seminars?: Seminar[];
      campaigns?: Campaign[];
      error?: string;
    };
    if (!response.ok) {
      setError(data.error || "Не удалось загрузить");
      return;
    }
    setSeminars(data.seminars ?? []);
    setCampaigns(data.campaigns ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-10">
      <p className="max-w-2xl text-sm leading-6 text-muted">
        Цены, места и статусы задаются здесь, не в коде. Оплата — через ЮKassa, когда приём денег
        включён во вкладке «Монетизация». Скидка Завсегдатая считается на сервере.
      </p>
      {error && <p className="text-sm text-rust">{error}</p>}
      {notice && <p className="text-sm text-muted">{notice}</p>}

      <section>
        <h2 className="font-serif text-2xl tracking-tight">Семинары</h2>
        <SeminarCreateForm
          onCreated={async () => {
            setNotice("Встреча создана");
            await load();
          }}
          onError={setError}
        />
        <ul className="mt-6 space-y-4">
          {seminars.map((seminar) => (
            <li key={seminar.id} className="rounded-2xl border border-ink/10 p-5">
              <SeminarEditForm
                seminar={seminar}
                onSaved={async () => {
                  setNotice("Встреча сохранена");
                  await load();
                }}
                onError={setError}
              />
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-serif text-2xl tracking-tight">Сборы на оцифровку</h2>
        <CampaignCreateForm
          onCreated={async () => {
            setNotice("Сбор создан");
            await load();
          }}
          onError={setError}
        />
        <ul className="mt-6 space-y-4">
          {campaigns.map((campaign) => (
            <li key={campaign.id} className="rounded-2xl border border-ink/10 p-5">
              <CampaignEditForm
                campaign={campaign}
                onSaved={async () => {
                  setNotice("Сбор сохранён");
                  await load();
                }}
                onError={setError}
              />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function SeminarCreateForm({
  onCreated,
  onError,
}: {
  onCreated: () => Promise<void>;
  onError: (text: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("2000");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const response = await fetch("/api/admin/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "seminar", title, priceRubles: Number(price), status: "draft" }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!response.ok) {
      onError(data.error || "Не удалось создать");
      return;
    }
    setTitle("");
    await onCreated();
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-3">
      <label className="field min-w-[16rem] flex-1">
        <span>Новая встреча</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} required placeholder="Как «Пробел»" />
      </label>
      <label className="field w-32">
        <span>Цена, ₽</span>
        <input type="number" min={0} value={price} onChange={(event) => setPrice(event.target.value)} />
      </label>
      <button className="button-primary" disabled={busy}>
        {busy ? <Loader2 size={15} className="animate-spin" /> : null}
        Создать черновик
      </button>
    </form>
  );
}

function SeminarEditForm({
  seminar,
  onSaved,
  onError,
}: {
  seminar: Seminar;
  onSaved: () => Promise<void>;
  onError: (text: string) => void;
}) {
  const [title, setTitle] = useState(seminar.title);
  const [summary, setSummary] = useState(seminar.summary ?? "");
  const [body, setBody] = useState(seminar.body);
  const [location, setLocation] = useState(seminar.location ?? "");
  const [startsAt, setStartsAt] = useState(seminar.startsAt?.slice(0, 16) ?? "");
  const [price, setPrice] = useState(String(kopeksToRubles(seminar.priceKopeks)));
  const [discount, setDiscount] = useState(String(seminar.discountPercent));
  const [seats, setSeats] = useState(seminar.seatLimit == null ? "" : String(seminar.seatLimit));
  const [status, setStatus] = useState(seminar.status);
  const [ticketUser, setTicketUser] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const response = await fetch(`/api/admin/events/${seminar.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "seminar",
        title,
        summary,
        body,
        location,
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        priceRubles: Number(price),
        discountPercent: Number(discount),
        seatLimit: seats.trim() ? Number(seats) : null,
        status,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!response.ok) {
      onError(data.error || "Не удалось сохранить");
      return;
    }
    await onSaved();
  }

  async function grant() {
    if (!ticketUser.trim()) return;
    setBusy(true);
    const response = await fetch(`/api/admin/events/${seminar.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ticket", userId: ticketUser.trim() }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!response.ok) {
      onError(data.error || "Не удалось записать");
      return;
    }
    setTicketUser("");
    await onSaved();
  }

  return (
    <form onSubmit={save} className="grid gap-3 md:grid-cols-2">
      <p className="md:col-span-2 text-xs text-muted">
        /seminars/{seminar.slug} · занято {seminar.seatsTaken}
        {seminar.seatLimit != null ? ` из ${seminar.seatLimit}` : ""} · {STATUS_LABEL[seminar.status]}
      </p>
      <label className="field md:col-span-2">
        <span>Название</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} required />
      </label>
      <label className="field md:col-span-2">
        <span>Коротко</span>
        <input value={summary} onChange={(event) => setSummary(event.target.value)} />
      </label>
      <label className="field md:col-span-2">
        <span>Текст</span>
        <textarea rows={4} value={body} onChange={(event) => setBody(event.target.value)} />
      </label>
      <label className="field">
        <span>Место</span>
        <input value={location} onChange={(event) => setLocation(event.target.value)} />
      </label>
      <label className="field">
        <span>Начало</span>
        <input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
      </label>
      <label className="field">
        <span>Цена, ₽</span>
        <input type="number" min={0} value={price} onChange={(event) => setPrice(event.target.value)} />
      </label>
      <label className="field">
        <span>Скидка Завсегдатая, %</span>
        <input type="number" min={0} max={90} value={discount} onChange={(event) => setDiscount(event.target.value)} />
      </label>
      <label className="field">
        <span>Мест (пусто — без лимита)</span>
        <input type="number" min={0} value={seats} onChange={(event) => setSeats(event.target.value)} />
      </label>
      <label className="field">
        <span>Статус</span>
        <select value={status} onChange={(event) => setStatus(event.target.value as Seminar["status"])}>
          {SEMINAR_STATUS.map((item) => (
            <option key={item} value={item}>
              {STATUS_LABEL[item]}
            </option>
          ))}
        </select>
      </label>
      <div className="md:col-span-2 flex flex-wrap items-end gap-3">
        <button className="button-primary" disabled={busy}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          Сохранить
        </button>
        <label className="field min-w-[14rem] flex-1">
          <span>Записать вручную (id читателя)</span>
          <input value={ticketUser} onChange={(event) => setTicketUser(event.target.value)} />
        </label>
        <button type="button" className="button-secondary" onClick={() => void grant()} disabled={busy}>
          Выдать место
        </button>
      </div>
    </form>
  );
}

function CampaignCreateForm({
  onCreated,
  onError,
}: {
  onCreated: () => Promise<void>;
  onError: (text: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("15000");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const response = await fetch("/api/admin/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "campaign", title, goalRubles: Number(goal), status: "draft" }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!response.ok) {
      onError(data.error || "Не удалось создать");
      return;
    }
    setTitle("");
    await onCreated();
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-3">
      <label className="field min-w-[16rem] flex-1">
        <span>Новый сбор</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} required />
      </label>
      <label className="field w-36">
        <span>Цель, ₽</span>
        <input type="number" min={100} value={goal} onChange={(event) => setGoal(event.target.value)} />
      </label>
      <button className="button-primary" disabled={busy}>
        {busy ? <Loader2 size={15} className="animate-spin" /> : null}
        Создать черновик
      </button>
    </form>
  );
}

function CampaignEditForm({
  campaign,
  onSaved,
  onError,
}: {
  campaign: Campaign;
  onSaved: () => Promise<void>;
  onError: (text: string) => void;
}) {
  const [title, setTitle] = useState(campaign.title);
  const [summary, setSummary] = useState(campaign.summary ?? "");
  const [body, setBody] = useState(campaign.body);
  const [goal, setGoal] = useState(String(kopeksToRubles(campaign.goalKopeks)));
  const [documentId, setDocumentId] = useState(campaign.documentId ?? "");
  const [status, setStatus] = useState(campaign.status);
  const [manual, setManual] = useState("");
  const [manualUser, setManualUser] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const response = await fetch(`/api/admin/events/${campaign.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "campaign",
        title,
        summary,
        body,
        goalRubles: Number(goal),
        documentId: documentId.trim() || null,
        status,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!response.ok) {
      onError(data.error || "Не удалось сохранить");
      return;
    }
    await onSaved();
  }

  async function donate() {
    setBusy(true);
    const response = await fetch(`/api/admin/events/${campaign.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "donation",
        amountRubles: Number(manual),
        userId: manualUser.trim() || undefined,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!response.ok) {
      onError(data.error || "Не удалось записать взнос");
      return;
    }
    setManual("");
    await onSaved();
  }

  return (
    <form onSubmit={save} className="grid gap-3 md:grid-cols-2">
      <p className="md:col-span-2 text-xs text-muted">
        /campaigns/{campaign.slug} · {formatMoney(campaign.raisedKopeks)} из {formatMoney(campaign.goalKopeks)} ·{" "}
        {campaign.backerCount} чел. · {STATUS_LABEL[campaign.status]}
      </p>
      <label className="field md:col-span-2">
        <span>Название</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} required />
      </label>
      <label className="field md:col-span-2">
        <span>Коротко</span>
        <input value={summary} onChange={(event) => setSummary(event.target.value)} />
      </label>
      <label className="field md:col-span-2">
        <span>Текст</span>
        <textarea rows={4} value={body} onChange={(event) => setBody(event.target.value)} />
      </label>
      <label className="field">
        <span>Цель, ₽</span>
        <input type="number" min={100} value={goal} onChange={(event) => setGoal(event.target.value)} />
      </label>
      <label className="field">
        <span>id книги (необязательно)</span>
        <input value={documentId} onChange={(event) => setDocumentId(event.target.value)} />
      </label>
      <label className="field">
        <span>Статус</span>
        <select value={status} onChange={(event) => setStatus(event.target.value as Campaign["status"])}>
          {CAMPAIGN_STATUS.map((item) => (
            <option key={item} value={item}>
              {STATUS_LABEL[item]}
            </option>
          ))}
        </select>
      </label>
      <div className="md:col-span-2 flex flex-wrap items-end gap-3">
        <button className="button-primary" disabled={busy}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          Сохранить
        </button>
        <label className="field w-32">
          <span>Взнос вручную, ₽</span>
          <input type="number" min={100} value={manual} onChange={(event) => setManual(event.target.value)} />
        </label>
        <label className="field min-w-[12rem] flex-1">
          <span>id читателя (можно пусто)</span>
          <input value={manualUser} onChange={(event) => setManualUser(event.target.value)} />
        </label>
        <button type="button" className="button-secondary" onClick={() => void donate()} disabled={busy}>
          Зачесть
        </button>
      </div>
    </form>
  );
}
