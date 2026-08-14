"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Copy, Link2, Share2, Users } from "lucide-react";

type Friend = { id: string; name: string };

type SharePayload = {
  title: string;
  url: string;
  excerpt?: string | null;
  kind?: "book" | "quote" | "annotation";
};

type PanelPos = { top: number; left: number; width: number };

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
  const [panelPos, setPanelPos] = useState<PanelPos | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

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

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent | TouchEvent) {
      const node = rootRef.current;
      const panel = panelRef.current;
      const target = event.target as Node;
      if (node?.contains(target) || panel?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    const t = window.setTimeout(() => {
      document.addEventListener("mousedown", onPointer);
      document.addEventListener("touchstart", onPointer);
    }, 0);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      setPanelPos(null);
      return;
    }
    function place() {
      const btn = buttonRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const width = Math.min(320, window.innerWidth - 24);
      const gap = 8;
      const estimatedHeight = 320;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < estimatedHeight && rect.top > estimatedHeight;
      let left = rect.right - width;
      left = Math.max(12, Math.min(left, window.innerWidth - width - 12));
      const top = openUp ? rect.top - gap - estimatedHeight : rect.bottom + gap;
      setPanelPos({
        top: Math.max(12, Math.min(top, window.innerHeight - 24)),
        left,
        width,
      });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  function absoluteUrl() {
    if (payload.url.startsWith("http")) return payload.url;
    if (typeof window === "undefined") return payload.url;
    return new URL(payload.url, window.location.origin).toString();
  }

  function buildShareText() {
    const kindLabel =
      payload.kind === "quote" ? "Цитата" : payload.kind === "annotation" ? "Пометка" : "Книга";
    const lines = [`${kindLabel}: ${payload.title}`, absoluteUrl()];
    if (payload.excerpt?.trim()) lines.push("", `«${payload.excerpt.trim().slice(0, 600)}»`);
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
    <div className={`relative ${className}`} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={compact ? "icon-button" : "button-secondary"}
        aria-expanded={open}
        aria-label="Поделиться"
        title="Поделиться"
      >
        <Share2 size={compact ? 14 : 15} />
        {!compact && "Поделиться"}
      </button>

      {open && panelPos && (
        <div
          ref={panelRef}
          className="sticker-panel fixed z-[80] max-h-[min(24rem,calc(100vh-1.5rem))] overflow-y-auto rounded-xl border border-ink/10 bg-white p-3 shadow-xl"
          style={{ top: panelPos.top, left: panelPos.left, width: panelPos.width }}
        >
          <p className="mb-2 text-[11px] text-muted">Поделиться</p>
          <p className="mb-3 line-clamp-2 font-serif text-sm leading-snug text-ink">{payload.title}</p>

          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex items-center gap-1.5 rounded-md border border-ink/15 px-2.5 py-1 text-[11px] hover:border-ink/40"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? "Скопировано" : "Ссылка"}
            </button>
            <a
              href={absoluteUrl()}
              className="inline-flex items-center gap-1.5 rounded-md border border-ink/15 px-2.5 py-1 text-[11px] hover:border-ink/40"
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
              <p className="text-xs text-muted">Пока нет друзей — добавьте на странице «Друзья».</p>
            )}
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {friends.map((friend) => (
                <li key={friend.id}>
                  <button
                    type="button"
                    disabled={sendingId === friend.id}
                    onClick={() => sendToFriend(friend.id)}
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-ink/[0.04]"
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
        </div>
      )}
    </div>
  );
}
