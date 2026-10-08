"use client";

/**
 * Вкладка «Монетизация» в админке.
 *
 * Здесь админ правит то, что раньше пришлось бы править в коде и выкатывать:
 * цены, состав тарифов (какие фичи входят), тираж «Основателя», дневные
 * лимиты скачиваний, реквизиты для чеков и текст над тарифами. Плюс ручная
 * выдача подписки (основателям, за оплату мимо кассы, в подарок) и журнал
 * платежей.
 *
 * Весь экран грузится одним GET /api/admin/billing, каждое сохранение —
 * отдельным POST, который возвращает обновлённые данные.
 */

import { FormEvent, useCallback, useEffect, useState } from "react";
import { BadgeCheck, CreditCard, Loader2, Lock, RefreshCw, Save, Settings2, Users } from "lucide-react";
import { formatMoney, kopeksToRubles } from "@/lib/money";

type Plan = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  priceMonthly: number;
  priceYearly: number | null;
  priceLifetime: number | null;
  features: string[];
  seatLimit: number | null;
  seatsTaken?: number;
  lifetime: boolean;
  accent: string | null;
  badge: string | null;
  active: boolean;
  sortOrder: number;
};

type Config = {
  paymentsEnabled: boolean;
  yookassaMode: "test" | "live";
  receiptsEnabled: boolean;
  downloadsPerDayFree: number;
  downloadsPerDayPaid: number;
  downloadsPerDayAnonymous: number;
  zipMaxDocuments: number;
  zipMaxMegabytes: number;
  legalName: string;
  legalInn: string;
  supportEmail: string;
  offerUrl: string;
  pricingIntro: string;
};

type Subscription = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  planSlug: string;
  status: string;
  period: string;
  startedAt: string | null;
  expiresAt: string | null;
  source: string;
  note: string | null;
};

type Payment = {
  id: string;
  userName: string | null;
  kind: string;
  amount: number;
  status: string;
  planSlug: string | null;
  period: string | null;
  description: string | null;
  providerPaymentId: string | null;
  createdAt: string;
  paidAt: string | null;
};

type State = {
  plans: Plan[];
  config: Config;
  subscriptions: Subscription[];
  payments: Payment[];
  features: { key: string; label: string }[];
  providerReady: { test: boolean; live: boolean };
};

const SECTIONS = ["Тарифы", "Настройки", "Подписки", "Платежи"] as const;
type Section = (typeof SECTIONS)[number];

const STATUS_LABELS: Record<string, string> = {
  active: "активна",
  canceled: "отменена",
  expired: "истекла",
  pending: "ожидает",
  succeeded: "оплачен",
  waiting_for_capture: "ждёт подтверждения",
  failed: "ошибка",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

export function BillingTab() {
  const [state, setState] = useState<State | null>(null);
  const [section, setSection] = useState<Section>("Тарифы");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/billing", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error || "Не удалось загрузить данные монетизации.");
      return;
    }
    setState(data as State);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function flash(text: string) {
    setMessage(text);
    setError("");
    window.setTimeout(() => setMessage(""), 4000);
  }

  if (!state) {
    return (
      <p className="flex items-center gap-2 py-12 text-sm text-muted">
        <Loader2 size={15} className="animate-spin" />
        {error || "Загружаю тарифы…"}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {SECTIONS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setSection(item)}
            className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${
              section === item ? "bg-ink text-paper" : "border border-ink/15 text-muted hover:text-ink"
            }`}
          >
            {item}
          </button>
        ))}
        <button type="button" onClick={() => void load()} className="icon-button ml-auto" title="Обновить">
          <RefreshCw size={15} />
        </button>
      </div>

      {!state.config.paymentsEnabled && (
        <p className="flex items-start gap-2 rounded-xl border border-rust/30 bg-rust/5 px-4 py-3 text-sm">
          <Lock size={15} className="mt-0.5 shrink-0 text-rust" />
          <span>
            Приём оплат выключен — кнопки «Оформить» на странице тарифов не показываются никому.
            Включается в разделе «Настройки», когда в переменных окружения появятся ключи ЮKassa.
          </span>
        </p>
      )}
      {message && <p className="text-sm text-rust">{message}</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}

      {section === "Тарифы" && (
        <PlansSection state={state} setState={setState} onSaved={flash} onError={setError} />
      )}
      {section === "Настройки" && (
        <SettingsSection state={state} setState={setState} onSaved={flash} onError={setError} />
      )}
      {section === "Подписки" && (
        <SubscriptionsSection state={state} setState={setState} onSaved={flash} onError={setError} />
      )}
      {section === "Платежи" && <PaymentsSection payments={state.payments} />}
    </div>
  );
}

/* ── Тарифы ──────────────────────────────────────────────────────────────── */

function PlansSection({
  state,
  setState,
  onSaved,
  onError,
}: {
  state: State;
  setState: (next: State) => void;
  onSaved: (text: string) => void;
  onError: (text: string) => void;
}) {
  return (
    <div className="space-y-5">
      <p className="max-w-2xl text-sm leading-6 text-muted">
        Цена и состав каждого уровня — это строки в базе, а не код. Галочки ниже определяют, что
        реально откроется человеку: их проверяет сервер на каждом запросе, поэтому снятая галочка
        сразу закрывает функцию.
      </p>
      {state.plans.map((plan) => (
        <PlanCard
          key={plan.id}
          plan={plan}
          features={state.features}
          onSaved={(plans) => {
            setState({ ...state, plans });
            onSaved(`Тариф «${plan.name}» сохранён`);
          }}
          onError={onError}
        />
      ))}
    </div>
  );
}

function PlanCard({
  plan,
  features,
  onSaved,
  onError,
}: {
  plan: Plan;
  features: { key: string; label: string }[];
  onSaved: (plans: Plan[]) => void;
  onError: (text: string) => void;
}) {
  const [draft, setDraft] = useState(plan);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => setDraft(plan), [plan]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const response = await fetch("/api/admin/billing/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: draft.id,
        name: draft.name,
        tagline: draft.tagline,
        description: draft.description,
        badge: draft.badge,
        active: draft.active,
        seatLimit: draft.seatLimit,
        priceMonthlyRub: kopeksToRubles(draft.priceMonthly),
        priceYearlyRub: draft.priceYearly == null ? null : kopeksToRubles(draft.priceYearly),
        priceLifetimeRub: draft.priceLifetime == null ? null : kopeksToRubles(draft.priceLifetime),
        features: draft.features,
      }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      onError(data.error || "Не удалось сохранить тариф.");
      return;
    }
    onSaved(data.plans as Plan[]);
  }

  function toggleFeature(key: string) {
    setDraft((current) => ({
      ...current,
      features: current.features.includes(key)
        ? current.features.filter((item) => item !== key)
        : [...current.features, key],
    }));
  }

  function priceField(label: string, value: number | null, apply: (next: number | null) => void) {
    return (
      <label className="field">
        <span>{label}</span>
        <input
          type="number"
          min={0}
          step={1}
          value={value == null ? "" : kopeksToRubles(value)}
          placeholder="—"
          onChange={(event) =>
            apply(event.target.value === "" ? null : Math.round(Number(event.target.value) * 100))
          }
        />
      </label>
    );
  }

  return (
    <form onSubmit={save} className="rounded-2xl border border-ink/10 bg-paper p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-serif text-xl">{draft.name}</p>
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted">
            {draft.slug}
            {" · "}
            {draft.priceMonthly > 0 ? `${formatMoney(draft.priceMonthly)}/мес` : "бесплатно"}
            {draft.priceYearly ? ` · ${formatMoney(draft.priceYearly)}/год` : ""}
            {draft.priceLifetime ? ` · ${formatMoney(draft.priceLifetime)} разово` : ""}
            {draft.seatLimit != null ? ` · мест ${plan.seatsTaken ?? 0}/${draft.seatLimit}` : ""}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(event) => setDraft({ ...draft, active: event.target.checked })}
          />
          Показывать на сайте
        </label>
        <button type="button" className="button-secondary" onClick={() => setOpen((value) => !value)}>
          {open ? "Свернуть" : "Изменить"}
        </button>
      </div>

      {open && (
        <div className="mt-5 space-y-4 border-t border-ink/10 pt-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="field">
              <span>Название</span>
              <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </label>
            <label className="field">
              <span>Значок рядом с ником</span>
              <input
                value={draft.badge ?? ""}
                placeholder="например: Билет"
                onChange={(event) => setDraft({ ...draft, badge: event.target.value })}
              />
            </label>
          </div>

          <label className="field">
            <span>Короткая строка (за что платят)</span>
            <input
              value={draft.tagline ?? ""}
              onChange={(event) => setDraft({ ...draft, tagline: event.target.value })}
            />
          </label>

          <label className="field">
            <span>Описание на странице тарифов</span>
            <textarea
              rows={2}
              value={draft.description ?? ""}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
          </label>

          <div className="grid gap-4 md:grid-cols-4">
            {priceField("Цена в месяц, ₽", draft.priceMonthly, (next) =>
              setDraft({ ...draft, priceMonthly: next ?? 0 }),
            )}
            {priceField("Цена за год, ₽", draft.priceYearly, (next) =>
              setDraft({ ...draft, priceYearly: next }),
            )}
            {priceField("Разовый взнос, ₽", draft.priceLifetime, (next) =>
              setDraft({ ...draft, priceLifetime: next }),
            )}
            <label className="field">
              <span>Тираж (мест)</span>
              <input
                type="number"
                min={0}
                value={draft.seatLimit ?? ""}
                placeholder="без ограничения"
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    seatLimit: event.target.value === "" ? null : Number(event.target.value),
                  })
                }
              />
            </label>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">
              Что входит
            </p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {features.map((feature) => (
                <label key={feature.key} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={draft.features.includes(feature.key)}
                    onChange={() => toggleFeature(feature.key)}
                  />
                  <span>
                    {feature.label}
                    <span className="ml-1 font-mono text-[10px] text-muted">{feature.key}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <button className="button-primary" disabled={busy}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Сохранить тариф
          </button>
        </div>
      )}
    </form>
  );
}

/* ── Настройки ───────────────────────────────────────────────────────────── */

function SettingsSection({
  state,
  setState,
  onSaved,
  onError,
}: {
  state: State;
  setState: (next: State) => void;
  onSaved: (text: string) => void;
  onError: (text: string) => void;
}) {
  const [draft, setDraft] = useState(state.config);
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const response = await fetch("/api/admin/billing/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      onError(data.error || "Не удалось сохранить настройки.");
      return;
    }
    setState({ ...state, config: data.config as Config });
    onSaved("Настройки сохранены");
  }

  const keysReady = draft.yookassaMode === "live" ? state.providerReady.live : state.providerReady.test;

  return (
    <form onSubmit={save} className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border border-ink/10 bg-paper p-5">
        <p className="mb-4 flex items-center gap-2 font-medium">
          <CreditCard size={16} className="text-rust" />
          Приём оплат
        </p>

        <label className="mb-3 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={draft.paymentsEnabled}
            onChange={(event) => setDraft({ ...draft, paymentsEnabled: event.target.checked })}
          />
          <span>
            Показывать кнопки оплаты
            <small className="block text-muted">
              Выключено — страница тарифов работает как витрина без оплаты.
            </small>
          </span>
        </label>

        <label className="field">
          <span>Магазин ЮKassa</span>
          <select
            value={draft.yookassaMode}
            onChange={(event) =>
              setDraft({ ...draft, yookassaMode: event.target.value === "live" ? "live" : "test" })
            }
          >
            <option value="test">Тестовый</option>
            <option value="live">Боевой</option>
          </select>
          <small className={keysReady ? "text-muted" : "text-red-700"}>
            {keysReady
              ? "Ключи найдены в переменных окружения."
              : "Ключи не заданы: добавьте их в .env на сервере и перезапустите приложение."}
          </small>
        </label>

        <label className="mt-3 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={draft.receiptsEnabled}
            onChange={(event) => setDraft({ ...draft, receiptsEnabled: event.target.checked })}
          />
          <span>
            Отправлять чеки через ЮKassa
            <small className="block text-muted">Для самозанятого — чек на почту плательщика.</small>
          </span>
        </label>
      </section>

      <section className="rounded-2xl border border-ink/10 bg-paper p-5">
        <p className="mb-4 flex items-center gap-2 font-medium">
          <Settings2 size={16} className="text-rust" />
          Лимиты выдачи файлов
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="field">
            <span>Скачиваний в сутки — без подписки</span>
            <input
              type="number"
              min={0}
              value={draft.downloadsPerDayFree}
              onChange={(event) => setDraft({ ...draft, downloadsPerDayFree: Number(event.target.value) })}
            />
          </label>
          <label className="field">
            <span>Скачиваний в сутки — с подпиской</span>
            <input
              type="number"
              min={0}
              value={draft.downloadsPerDayPaid}
              onChange={(event) => setDraft({ ...draft, downloadsPerDayPaid: Number(event.target.value) })}
            />
          </label>
          <label className="field">
            <span>Книг в одном ZIP</span>
            <input
              type="number"
              min={1}
              value={draft.zipMaxDocuments}
              onChange={(event) => setDraft({ ...draft, zipMaxDocuments: Number(event.target.value) })}
            />
          </label>
          <label className="field">
            <span>Размер ZIP, МБ</span>
            <input
              type="number"
              min={1}
              value={draft.zipMaxMegabytes}
              onChange={(event) => setDraft({ ...draft, zipMaxMegabytes: Number(event.target.value) })}
            />
          </label>
        </div>
        <p className="mt-2 text-xs leading-5 text-muted">
          0 — значит «без лимита». Чтение онлайн эти числа не ограничивают: считаются только
          выгрузки файлов, ZIP-архивы и забор книг через OPDS.
        </p>
      </section>

      <section className="rounded-2xl border border-ink/10 bg-paper p-5">
        <p className="mb-4 font-medium">Реквизиты для чеков и оферты</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="field">
            <span>Кто принимает оплату</span>
            <input
              value={draft.legalName}
              placeholder="Самозанятый Иванов И. И."
              onChange={(event) => setDraft({ ...draft, legalName: event.target.value })}
            />
          </label>
          <label className="field">
            <span>ИНН</span>
            <input value={draft.legalInn} onChange={(event) => setDraft({ ...draft, legalInn: event.target.value })} />
          </label>
          <label className="field">
            <span>Почта поддержки</span>
            <input
              type="email"
              value={draft.supportEmail}
              onChange={(event) => setDraft({ ...draft, supportEmail: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Ссылка на оферту</span>
            <input value={draft.offerUrl} onChange={(event) => setDraft({ ...draft, offerUrl: event.target.value })} />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-ink/10 bg-paper p-5">
        <p className="mb-4 font-medium">Текст над тарифами</p>
        <label className="field">
          <span>Вступление на странице подписки</span>
          <textarea
            rows={4}
            value={draft.pricingIntro}
            onChange={(event) => setDraft({ ...draft, pricingIntro: event.target.value })}
          />
        </label>
      </section>

      <div className="lg:col-span-2">
        <button className="button-primary" disabled={busy}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          Сохранить настройки
        </button>
      </div>
    </form>
  );
}

/* ── Подписки ────────────────────────────────────────────────────────────── */

function SubscriptionsSection({
  state,
  setState,
  onSaved,
  onError,
}: {
  state: State;
  setState: (next: State) => void;
  onSaved: (text: string) => void;
  onError: (text: string) => void;
}) {
  const [user, setUser] = useState("");
  const [planSlug, setPlanSlug] = useState(state.plans[1]?.slug ?? "reader");
  const [period, setPeriod] = useState<"month" | "year" | "lifetime">("month");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(payload: Record<string, unknown>, okMessage: string) {
    setBusy(true);
    const response = await fetch("/api/admin/billing/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      onError(data.error || "Не удалось изменить подписку.");
      return;
    }
    setState({ ...state, subscriptions: data.subscriptions as Subscription[] });
    onSaved(okMessage);
  }

  return (
    <div className="space-y-6">
      <form
        className="rounded-2xl border border-ink/10 bg-paper p-5"
        onSubmit={(event) => {
          event.preventDefault();
          void send({ action: "grant", user, planSlug, period, note }, "Подписка выдана").then(() => {
            setUser("");
            setNote("");
          });
        }}
      >
        <p className="mb-4 flex items-center gap-2 font-medium">
          <BadgeCheck size={16} className="text-rust" />
          Выдать вручную
        </p>
        <div className="grid gap-4 md:grid-cols-4">
          <label className="field md:col-span-2">
            <span>Кому (почта, ник или id)</span>
            <input value={user} onChange={(event) => setUser(event.target.value)} required />
          </label>
          <label className="field">
            <span>Тариф</span>
            <select value={planSlug} onChange={(event) => setPlanSlug(event.target.value)}>
              {state.plans.map((plan) => (
                <option key={plan.slug} value={plan.slug}>
                  {plan.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Срок</span>
            <select
              value={period}
              onChange={(event) => setPeriod(event.target.value as "month" | "year" | "lifetime")}
            >
              <option value="month">месяц</option>
              <option value="year">год</option>
              <option value="lifetime">навсегда</option>
            </select>
          </label>
        </div>
        <label className="field mt-3">
          <span>Заметка (зачем выдали)</span>
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="оплата переводом" />
        </label>
        <button className="button-primary mt-4" disabled={busy}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Users size={15} />}
          Выдать
        </button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-ink/10">
        <table className="w-full text-sm">
          <thead className="bg-ink/[0.03] text-left text-xs uppercase tracking-widest text-muted">
            <tr>
              <th className="px-4 py-3">Читатель</th>
              <th className="px-4 py-3">Тариф</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3">До</th>
              <th className="px-4 py-3">Откуда</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {state.subscriptions.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted">
                  Подписок пока нет.
                </td>
              </tr>
            )}
            {state.subscriptions.map((row) => (
              <tr key={row.id} className="border-t border-ink/8">
                <td className="px-4 py-3">
                  <span className="block">{row.userName}</span>
                  <span className="font-mono text-[11px] text-muted">{row.userEmail}</span>
                </td>
                <td className="px-4 py-3">{row.planSlug}</td>
                <td className="px-4 py-3">{STATUS_LABELS[row.status] ?? row.status}</td>
                <td className="px-4 py-3">{row.expiresAt ? formatDate(row.expiresAt) : "бессрочно"}</td>
                <td className="px-4 py-3 text-muted">{row.source}</td>
                <td className="px-4 py-3 text-right">
                  {row.status === "active" && (
                    <button
                      type="button"
                      className="text-xs text-muted hover:text-red-700"
                      onClick={() =>
                        void send({ action: "cancel", subscriptionId: row.id }, "Подписка отменена")
                      }
                    >
                      Отменить
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Платежи ─────────────────────────────────────────────────────────────── */

function PaymentsSection({ payments }: { payments: Payment[] }) {
  const succeeded = payments.filter((item) => item.status === "succeeded");
  const total = succeeded.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-ink/10 py-3 text-center">
          <p className="font-serif text-2xl text-rust">{formatMoney(total)}</p>
          <p className="text-xs text-muted">получено всего</p>
        </div>
        <div className="rounded-xl border border-ink/10 py-3 text-center">
          <p className="font-serif text-2xl">{succeeded.length}</p>
          <p className="text-xs text-muted">успешных платежей</p>
        </div>
        <div className="rounded-xl border border-ink/10 py-3 text-center">
          <p className="font-serif text-2xl">{payments.length - succeeded.length}</p>
          <p className="text-xs text-muted">не доведены до конца</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-ink/10">
        <table className="w-full text-sm">
          <thead className="bg-ink/[0.03] text-left text-xs uppercase tracking-widest text-muted">
            <tr>
              <th className="px-4 py-3">Когда</th>
              <th className="px-4 py-3">Кто</th>
              <th className="px-4 py-3">За что</th>
              <th className="px-4 py-3">Сумма</th>
              <th className="px-4 py-3">Статус</th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted">
                  Платежей пока не было.
                </td>
              </tr>
            )}
            {payments.map((row) => (
              <tr key={row.id} className="border-t border-ink/8">
                <td className="px-4 py-3 whitespace-nowrap">{formatDate(row.paidAt ?? row.createdAt)}</td>
                <td className="px-4 py-3">{row.userName ?? "—"}</td>
                <td className="px-4 py-3">
                  {row.description || row.planSlug || row.kind}
                  {row.period ? <span className="text-muted"> · {row.period}</span> : null}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{formatMoney(row.amount)}</td>
                <td className="px-4 py-3">{STATUS_LABELS[row.status] ?? row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
