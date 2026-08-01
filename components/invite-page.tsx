"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Megaphone, UserPlus, Users } from "lucide-react";
import { countLabel } from "@/lib/pluralize";

export type OwnInvite = {
  id: string;
  code: string;
  email: string | null;
  note: string | null;
  usedBy: string | null;
  createdAt: string;
  multiUse: boolean;
  useCount: number;
};

export function InvitePage({
  invites,
  referredCount,
  maxUnused,
  canCreateMassInvite,
}: {
  invites: OwnInvite[];
  referredCount: number;
  maxUnused: number;
  /** Admins and boosters can mint a reusable "drop in the group chat" link
   * in addition to the regular one-time referral codes everyone gets. */
  canCreateMassInvite: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [lastCode, setLastCode] = useState("");
  const [massMode, setMassMode] = useState(false);

  const oneTimeInvites = invites.filter((i) => !i.multiUse);
  const massInvites = invites.filter((i) => i.multiUse);
  const unusedCount = oneTimeInvites.filter((i) => !i.usedBy).length;
  const atLimit = !massMode && unusedCount >= maxUnused;

  async function createInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = event.currentTarget;
    const formData = new FormData(form);
    const response = await fetch("/api/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: formData.get("email"),
        note: formData.get("note"),
        multiUse: massMode,
      }),
    });
    const result = (await response.json().catch(() => ({}))) as { code?: string; error?: string };
    setBusy(false);
    if (!response.ok || !result.code) {
      setMessage(result.error || "Не удалось создать приглашение.");
      return;
    }
    setLastCode(result.code);
    form.reset();
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-2xl">
      <p className="eyebrow mb-3">Рефералы</p>
      <h1 className="font-serif text-4xl tracking-tight md:text-5xl">Пригласить друзей</h1>
      <p className="mt-4 text-sm leading-6 text-muted">
        Регистрация на сайте открытая. Ссылка ниже нужна только чтобы отметить, кто кого позвал —
        так видно, как растёт круг читателей. Роль бустера по ссылке не выдаётся.
      </p>

      <div className="mt-6 flex items-center gap-2 rounded-xl bg-ink/5 px-4 py-3 text-sm">
        <Users size={16} className="text-rust" />
        Вы привели {countLabel(referredCount, ["человек", "человека", "человек"])}
      </div>

      {massInvites.length > 0 && (
        <section className="mt-8 rounded-2xl border border-rust/20 bg-rust/[0.04] p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-full bg-rust/10 text-rust">
              <Megaphone size={17} />
            </span>
            <div>
              <p className="font-medium">Массовые ссылки</p>
              <p className="text-xs text-muted">
                Одна ссылка — можно кидать в общий чат, регистраций сколько угодно.
              </p>
            </div>
          </div>
          <div>
            {massInvites.map((invite) => (
              <div key={invite.id} className="border-t border-rust/10 py-3 first:border-t-0">
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <p className="text-xs text-muted">
                    {invite.note || "без заметки"} · использована{" "}
                    {countLabel(invite.useCount, ["раз", "раза", "раз"])}
                  </p>
                </div>
                <InviteLink code={invite.code} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8 rounded-2xl border border-ink/10 bg-paper p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-full bg-rust/10 text-rust">
            <UserPlus size={17} />
          </span>
          <div>
            <p className="font-medium">Новое приглашение</p>
            <p className="text-xs text-muted">
              Активных неиспользованных: {unusedCount} из {maxUnused}
            </p>
          </div>
        </div>

        {canCreateMassInvite && (
          <div className="mb-4 flex gap-2 rounded-full bg-ink/5 p-1 text-xs">
            <button
              type="button"
              onClick={() => setMassMode(false)}
              className={`flex-1 rounded-full py-1.5 transition-colors ${!massMode ? "bg-paper shadow-sm" : "text-muted"}`}
            >
              Обычное
            </button>
            <button
              type="button"
              onClick={() => setMassMode(true)}
              className={`flex-1 rounded-full py-1.5 transition-colors ${massMode ? "bg-paper shadow-sm" : "text-muted"}`}
            >
              Массовое (для чата)
            </button>
          </div>
        )}

        {atLimit ? (
          <p className="rounded-xl bg-ink/5 p-4 text-sm text-muted">
            Дождитесь, пока кто-нибудь воспользуется одним из уже выданных приглашений — тогда
            можно будет создать новое.
          </p>
        ) : (
          <form onSubmit={createInvite} className="space-y-4">
            {!massMode && (
              <label className="field">
                <span>Почта (необязательно)</span>
                <input name="email" type="email" placeholder="друг@example.com" />
              </label>
            )}
            <label className="field">
              <span>Заметка (необязательно)</span>
              <input
                name="note"
                placeholder={massMode ? "например: общий чат в Telegram" : "Для кого приглашение"}
              />
            </label>
            <button className="button-primary w-full" disabled={busy}>
              {busy ? "Создаю…" : "Сгенерировать ссылку"}
            </button>
            {message && <p className="text-sm text-muted">{message}</p>}
            {lastCode && <InviteLink code={lastCode} />}
          </form>
        )}
      </section>

      {oneTimeInvites.length > 0 && (
        <section className="mt-8 rounded-2xl border border-ink/10 bg-paper p-6 shadow-sm">
          <p className="eyebrow mb-4">Ваши приглашения</p>
          <div>
            {oneTimeInvites.map((invite) => (
              <div key={invite.id} className="grid grid-cols-[1fr_auto] items-center gap-4 border-t border-ink/10 py-3 first:border-t-0">
                <div className="min-w-0">
                  <p className="font-mono text-sm">{invite.code}</p>
                  <p className="truncate text-xs text-muted">
                    {invite.email || "любая почта"} {invite.note ? `· ${invite.note}` : ""}
                  </p>
                </div>
                <span className={`text-xs ${invite.usedBy ? "text-muted" : "text-emerald-700"}`}>
                  {invite.usedBy ? "использовано" : "активно"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function InviteLink({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const link = typeof window !== "undefined" ? `${window.location.origin}/register?code=${code}` : "";

  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="flex w-full items-center justify-between gap-2 rounded-xl border border-ink/10 bg-ink/[0.03] px-3 py-2 text-left text-xs"
    >
      <span className="truncate">{link}</span>
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}
