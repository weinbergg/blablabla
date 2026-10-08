"use client";

import { useEffect, useState } from "react";
import { BookOpen, Copy, Trash2 } from "lucide-react";

type TokenRow = {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
};

/**
 * Ключи для читалок. Ключ показывается один раз — после перезагрузки
 * страницы остаётся только его начало, чтобы человек узнал устройство в
 * списке. Так принято у всех: в базе лежит хеш, восстановить ключ нельзя.
 */
export function ReaderKeys({ origin }: { origin: string }) {
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [fresh, setFresh] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function load() {
    const response = await fetch("/api/account/reader-keys");
    if (!response.ok) return;
    const result = await response.json();
    setTokens(result.tokens ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function create() {
    setBusy(true);
    setError("");
    const response = await fetch("/api/account/reader-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() || "Читалка" }),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(result.error || "Не получилось создать ключ.");
      return;
    }
    setFresh(result.token);
    setName("");
    void load();
  }

  async function revoke(id: string) {
    await fetch(`/api/account/reader-keys?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    void load();
  }

  const catalogUrl = `${origin}/opds`;

  return (
    <div className="mt-5">
      <div className="rounded-2xl border border-ink/10 bg-paper/60 p-4 text-sm dark:bg-white/5">
        <p className="flex items-center gap-2 font-medium">
          <BookOpen size={15} className="text-rust" />
          Адрес каталога
        </p>
        <p className="mt-2 break-all font-mono text-xs">{catalogUrl}</p>
        <p className="mt-2 text-xs leading-5 text-muted">
          В читалке добавьте OPDS-каталог по этому адресу. Логин — любой (можно
          вашу почту), пароль — ключ ниже.
        </p>
      </div>

      {fresh && (
        <div className="mt-4 rounded-2xl border border-rust/30 bg-rust/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-rust">
            Ключ создан — скопируйте сейчас
          </p>
          <p className="mt-2 break-all font-mono text-xs">{fresh}</p>
          <button
            type="button"
            className="button-secondary mt-3 h-9 px-3 text-xs"
            onClick={async () => {
              await navigator.clipboard.writeText(fresh);
              setCopied(true);
            }}
          >
            <Copy size={13} />
            {copied ? "Скопировано" : "Скопировать"}
          </button>
          <p className="mt-2 text-xs leading-5 text-muted">
            Второй раз мы его не покажем: на сервере хранится только отпечаток.
            Потеряете — создайте новый, старый отзовите.
          </p>
        </div>
      )}

      {tokens.length > 0 && (
        <ul className="mt-4 divide-y divide-ink/10">
          {tokens.map((token) => (
            <li key={token.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm">{token.name}</p>
                <p className="text-xs text-muted">
                  {token.prefix}… ·{" "}
                  {token.lastUsedAt
                    ? `последний раз ${new Date(token.lastUsedAt).toLocaleDateString("ru-RU")}`
                    : "ещё не использовался"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => revoke(token.id)}
                className="shrink-0 rounded-full p-2 text-muted transition-colors hover:bg-ink/5 hover:text-rust"
                aria-label={`Отозвать ключ ${token.name}`}
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex items-end gap-2">
        <label className="field flex-1">
          <span>Название устройства</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="«Kindle», «телефон»"
            maxLength={80}
          />
        </label>
        <button type="button" onClick={create} disabled={busy} className="button-secondary px-4 text-sm">
          {busy ? "…" : "Новый ключ"}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-rust">{error}</p>}
    </div>
  );
}
