"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Link2, Share2, Users } from "lucide-react";

type Friend = { id: string; name: string };

type SharePayload = {
  title: string;
  url: string;
  /** Optional quote / annotation body to include in the DM. */
  excerpt?: string | null;
  kind?: "book" | "quote" | "annotation";
};

export function ShareWithFriends({
  payload,
  compact = false,
  className = "",
}: {
  payload: SharePayload;
  compact?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setMessage(null);
    (async () => {
      try {
        const res = await fetch("/api/friends");
        if (!res.ok) {
          if (!cancelled) setMessage("Войдите, чтобы делиться с друзьями.");
          return;
        }
        const data = (await res.json()) as { friends?: Friend[] };
        if (!cancelled) setFriends(data.friends ?? []);
      } catch {
        if (!cancelled) setMessage("Не удалось загрузить друзей.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  function absoluteUrl() {
    if (payload.url.startsWith("http")) return payload.url;
    if (typeof window === "undefined") return payload.url;
    return new URL(payload.url, window.location.origin).toString();
  }

  function buildShareText() {
    const kindLabel =
      payload.kind === "quote"
        ? "Цитата"
        : payload.kind === "annotation"
          ? "Пометка"
          : "Книга";
    const lines = [`${kindLabel}: ${payload.title}`, absoluteUrl()];
    if (payload.excerpt?.trim()) {
      lines.push("", `«${payload.excerpt.trim().slice(0, 600)}»`);
    }
    return lines.join("\n");
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(absoluteUrl());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setMessage("Не удалось скопировать ссылку.");
    }
  }

  async function sendToFriend(friendId: string) {
    setSendingId(friendId);
    setMessage(null);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantIds: [friendId],
          title: payload.title.slice(0, 80),
          body: buildShareText(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        conversationId?: string;
        error?: string;
      };
      if (!res.ok) {
        setMessage(data.error || "Не удалось отправить.");
        return;
      }
      setMessage("Отправлено в сообщения.");
      if (data.conversationId) {
        window.setTimeout(() => {
          window.location.href = `/messages/${data.conversationId}`;
        }, 600);
      }
    } finally {
      setSendingId(null);
    }
  }

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={compact ? "icon-button" : "button-secondary"}
        aria-label="Поделиться"
        title="Поделиться"
      >
        <Share2 size={compact ? 14 : 15} />
        {!compact && "Поделиться"}
      </button>

      {open && (
        <div className="sticker-panel absolute right-0 top-full z-40 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-ink/10 bg-white p-3 shadow-xl">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted">
            Поделиться
          </p>
          <p className="mb-3 line-clamp-2 font-serif text-sm leading-snug text-ink">
            {payload.title}
          </p>

          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 px-2.5 py-1 text-[11px] hover:border-rust hover:text-rust"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? "Скопировано" : "Ссылка"}
            </button>
            <a
              href={absoluteUrl()}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 px-2.5 py-1 text-[11px] hover:border-rust hover:text-rust"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Link2 size={12} />
              Открыть
            </a>
          </div>

          <div className="border-t border-ink/10 pt-2">
            <p className="mb-1.5 flex items-center gap-1 text-[11px] text-muted">
              <Users size={12} />
              Друзьям в сообщения
            </p>
            {loading && <p className="text-xs text-muted">загрузка…</p>}
            {!loading && friends.length === 0 && (
              <p className="text-xs text-muted">
                Пока нет друзей — добавьте на странице «Друзья».
              </p>
            )}
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {friends.map((friend) => (
                <li key={friend.id}>
                  <button
                    type="button"
                    disabled={sendingId === friend.id}
                    onClick={() => sendToFriend(friend.id)}
                    className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-ink/[0.04]"
                  >
                    <span>{friend.name}</span>
                    <span className="text-[11px] text-rust">
                      {sendingId === friend.id ? "…" : "Отправить"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {message && <p className="mt-2 text-[11px] text-muted">{message}</p>}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-2 text-[11px] text-muted hover:text-ink"
          >
            Закрыть
          </button>
        </div>
      )}
    </div>
  );
}
