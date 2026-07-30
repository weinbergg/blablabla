"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, UserPlus, Users } from "lucide-react";
import { countLabel } from "@/lib/pluralize";

export type OwnInvite = {
  id: string;
  code: string;
  email: string | null;
  note: string | null;
  usedBy: string | null;
  createdAt: string;
};

export function InvitePage({
  invites,
  referredCount,
  maxUnused,
}: {
  invites: OwnInvite[];
  referredCount: number;
  maxUnused: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [lastCode, setLastCode] = useState("");

  const unusedCount = invites.filter((i) => !i.usedBy).length;
  const atLimit = unusedCount >= maxUnused;

  async function createInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = event.currentTarget;
    const formData = new FormData(form);
    const response = await fetch("/api/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: formData.get("email"), note: formData.get("note") }),
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
        Библиотека открыта по приглашениям. Сгенерируйте ссылку и поделитесь ей — мы запоминаем,
        кто кого позвал, чтобы видеть, как растёт круг читателей, но никак иначе это не ограничиваем.
      </p>

      <div className="mt-6 flex items-center gap-2 rounded-xl bg-ink/5 px-4 py-3 text-sm">
        <Users size={16} className="text-rust" />
        Вы привели {countLabel(referredCount, ["человек", "человека", "человек"])}
      </div>

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

        {atLimit ? (
          <p className="rounded-xl bg-ink/5 p-4 text-sm text-muted">
            Дождитесь, пока кто-нибудь воспользуется одним из уже выданных приглашений — тогда
            можно будет создать новое.
          </p>
        ) : (
          <form onSubmit={createInvite} className="space-y-4">
            <label className="field">
              <span>Почта (необязательно)</span>
              <input name="email" type="email" placeholder="друг@example.com" />
            </label>
            <label className="field">
              <span>Заметка (необязательно)</span>
              <input name="note" placeholder="Для кого приглашение" />
            </label>
            <button className="button-primary w-full" disabled={busy}>
              {busy ? "Создаю…" : "Сгенерировать ссылку"}
            </button>
            {message && <p className="text-sm text-muted">{message}</p>}
            {lastCode && <InviteLink code={lastCode} />}
          </form>
        )}
      </section>

      {invites.length > 0 && (
        <section className="mt-8 rounded-2xl border border-ink/10 bg-paper p-6 shadow-sm">
          <p className="eyebrow mb-4">Ваши приглашения</p>
          <div>
            {invites.map((invite) => (
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
