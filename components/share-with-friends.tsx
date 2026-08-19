"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Copy, MessageSquareText, PanelsTopLeft, Share2, Users } from "lucide-react";
import { serializeShareMessage, type SharePayload } from "@/lib/share-message";

type Friend = { id: string; name: string };
type DiscussionTopic = { id: string; title: string; documentId?: string | null; documentTitle?: string | null };

type PanelPos = { top: number; left: number; width: number };

export function ShareWithFriends({
  payload,
  compact = false,
  className = "",
  buttonLabel,
  preferNativeShare = false,
  fallbackToCopy = false,
  buttonClassName = "",
}: {
  payload: SharePayload;
  compact?: boolean;
  className?: string;
  buttonLabel?: string;
  preferNativeShare?: boolean;
  fallbackToCopy?: boolean;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [topicSendingId, setTopicSendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [quickCopied, setQuickCopied] = useState(false);
  const [cardCopied, setCardCopied] = useState(false);
  const [discussionQueued, setDiscussionQueued] = useState(false);
  const [topics, setTopics] = useState<DiscussionTopic[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [panelPos, setPanelPos] = useState<PanelPos | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setTopicsLoading(true);
    setMessage(null);
    (async () => {
      try {
        const [friendsRes, topicsRes] = await Promise.all([
          fetch("/api/friends").catch(() => null),
          fetch("/api/forum/topics?limit=8").catch(() => null),
        ]);
        if (cancelled) return;

        if (friendsRes?.ok) {
          const data = (await friendsRes.json()) as { friends?: Friend[] };
          setFriends(data.friends ?? []);
        } else {
          setFriends([]);
        }

        if (topicsRes?.ok) {
          const data = (await topicsRes.json()) as { topics?: DiscussionTopic[] };
          setTopics(data.topics ?? []);
        } else {
          setTopics([]);
        }

        if (!friendsRes && !topicsRes) {
          setMessage("Не удалось загрузить варианты для отправки.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setTopicsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
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
      document.addEventListener("click", onPointer);
    }, 0);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("click", onPointer);
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
      const panelHeight = panelRef.current?.offsetHeight ?? 320;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < panelHeight && rect.top > panelHeight;
      let left = rect.right - width;
      left = Math.max(12, Math.min(left, window.innerWidth - width - 12));
      const top = openUp ? rect.top - gap - panelHeight : rect.bottom + gap;
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
  }, [friends.length, loading, message, open]);

  function resolvedPayload(): SharePayload {
    const baseUrl =
      payload.url.startsWith("http") || typeof window === "undefined"
        ? new URL(payload.url, typeof window === "undefined" ? "https://example.invalid" : window.location.origin)
        : new URL(payload.url, window.location.origin);
    if (payload.kind === "quote" && payload.excerpt?.trim()) {
      baseUrl.searchParams.set("sharedQuote", payload.excerpt.trim().slice(0, 240));
    }
    return {
      ...payload,
      url: payload.url.startsWith("http") || typeof window === "undefined"
        ? baseUrl.toString()
        : `${baseUrl.pathname}${baseUrl.search}${baseUrl.hash}`,
      excerpt: payload.excerpt?.trim().slice(0, 600) || null,
    };
  }

  function absoluteUrl() {
    const resolved = resolvedPayload();
    if (resolved.url.startsWith("http")) return resolved.url;
    if (typeof window === "undefined") return resolved.url;
    return new URL(resolved.url, window.location.origin).toString();
  }

  function discussionUrl() {
    const url = new URL(absoluteUrl());
    url.hash = "discussion-compose";
    return url.toString();
  }

  function canQueueIntoCurrentDiscussion() {
    if (typeof window === "undefined") {
      return false;
    }
    try {
      const pathname = window.location.pathname;
      if (!pathname.startsWith("/documents/") && !pathname.startsWith("/discuss/")) {
        return false;
      }
      const target = new URL(absoluteUrl());
      return target.pathname === pathname;
    } catch {
      return false;
    }
  }

  function currentDocumentId() {
    try {
      const target = new URL(absoluteUrl());
      const match = target.pathname.match(/^\/documents\/([^/]+)/);
      return match?.[1] ?? null;
    } catch {
      return null;
    }
  }

  function buildShareText() {
    const resolved = resolvedPayload();
    const kindLabel =
      resolved.kind === "quote" ? "Цитата" : resolved.kind === "annotation" ? "Пометка" : "Книга";
    const lines = [`${kindLabel}: ${resolved.title}`, absoluteUrl()];
    if (resolved.excerpt?.trim()) lines.push("", `«${resolved.excerpt.trim().slice(0, 600)}»`);
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
      const resolved = resolvedPayload();
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantIds: [friendId],
          title: resolved.title.slice(0, 80),
          body: serializeShareMessage(resolved),
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

  async function copyCard() {
    try {
      await navigator.clipboard.writeText(serializeShareMessage(resolvedPayload()));
      setCardCopied(true);
      window.setTimeout(() => setCardCopied(false), 1600);
    } catch {
      setMessage("Не удалось скопировать карточку.");
    }
  }

  function queueForDiscussion() {
    window.dispatchEvent(
      new CustomEvent("blabla:discussion-share", {
        detail: {
          body: serializeShareMessage(resolvedPayload()),
          sourceUrl: absoluteUrl(),
        },
      }),
    );
    setDiscussionQueued(true);
    setMessage("Карточка подготовлена для обсуждения.");
    window.setTimeout(() => setDiscussionQueued(false), 1600);
    setOpen(false);
  }

  async function sendToTopic(topicId: string) {
    setTopicSendingId(topicId);
    setMessage(null);
    try {
      const res = await fetch(`/api/forum/topics/${topicId}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: serializeShareMessage(resolvedPayload()) }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMessage(data.error || "Не удалось отправить в тему.");
        return;
      }
      setMessage("Цитата отправлена в обсуждение.");
    } finally {
      setTopicSendingId(null);
    }
  }

  async function handleButtonClick() {
    if (preferNativeShare && typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({
          title: payload.title,
          text: payload.excerpt?.trim() || payload.title,
          url: absoluteUrl(),
        });
        return;
      } catch (error) {
        const name =
          error && typeof error === "object" && "name" in error
            ? String((error as { name?: string }).name)
            : "";
        if (name === "AbortError") return;
      }
    }
    if (fallbackToCopy) {
      try {
        await navigator.clipboard.writeText(buildShareText());
        setQuickCopied(true);
        window.setTimeout(() => setQuickCopied(false), 1600);
      } catch {
        setOpen(true);
        setMessage("Не удалось скопировать цитату.");
      }
      return;
    }
    setOpen((value) => !value);
  }

  const iconOnly = compact && !buttonLabel;
  const utilityButtonClass =
    "inline-flex min-h-9 items-center justify-center gap-2 rounded-full border border-ink/12 px-3 text-[12px] font-medium text-ink transition-colors hover:border-ink/30 hover:bg-ink/[0.03]";
  const rowButtonClass =
    "flex w-full items-center justify-between rounded-2xl border border-transparent px-3 py-2 text-left text-sm text-ink transition-colors hover:border-ink/10 hover:bg-ink/[0.03]";
  const canPrepareDiscussion = canQueueIntoCurrentDiscussion();
  const relatedDocumentId = currentDocumentId();
  const sortedTopics = [...topics].sort((a, b) => {
    const aRelated = a.documentId === relatedDocumentId ? 1 : 0;
    const bRelated = b.documentId === relatedDocumentId ? 1 : 0;
    return bRelated - aRelated;
  });

  return (
    <div className={`relative ${className}`} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => void handleButtonClick()}
        className={`${iconOnly ? "icon-button" : "button-secondary"} ${buttonClassName}`.trim()}
        aria-expanded={open}
        aria-label="Поделиться"
        title="Поделиться"
      >
        <Share2 size={compact ? 14 : 15} />
        {(buttonLabel || !compact) && (quickCopied ? "Скопировано" : buttonLabel ?? "Поделиться")}
      </button>

      {open && panelPos && (
        <div
          ref={panelRef}
          className="sticker-panel fixed z-[80] max-h-[min(30rem,calc(100vh-1.5rem))] overflow-y-auto rounded-[22px] border border-ink/10 bg-white p-4 shadow-[0_18px_45px_rgba(23,32,44,0.14)]"
          style={{ top: panelPos.top, left: panelPos.left, width: panelPos.width }}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] text-muted">Поделиться</p>
              <p className="mt-1 line-clamp-2 font-serif text-sm leading-snug text-ink">{payload.title}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="shrink-0 rounded-full px-2 py-1 text-[11px] text-muted transition-colors hover:bg-ink/[0.04] hover:text-ink"
            >
              Закрыть
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <p className="mb-2 text-[11px] text-muted">Быстро</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={copyLink} className={utilityButtonClass}>
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? "Скопировано" : "Ссылка"}
                </button>
                <button type="button" onClick={() => void copyCard()} className={utilityButtonClass}>
                  {cardCopied ? <Check size={13} /> : <PanelsTopLeft size={13} />}
                  {cardCopied ? "Скопировано" : "Карточка"}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-ink/8 bg-ink/[0.02] p-2.5">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] text-muted">
                <Users size={12} />
                В чаты
              </p>
              {loading && <p className="px-3 py-2 text-xs text-muted">загрузка…</p>}
              {!loading && friends.length === 0 && (
                <p className="px-3 py-2 text-xs text-muted">Пока нет друзей — добавьте на странице «Друзья».</p>
              )}
              <ul className="max-h-40 space-y-1 overflow-y-auto">
                {friends.map((friend) => (
                  <li key={friend.id}>
                    <button
                      type="button"
                      disabled={sendingId === friend.id}
                      onClick={() => sendToFriend(friend.id)}
                      className={rowButtonClass}
                    >
                      <span className="truncate">{friend.name}</span>
                      <span className="shrink-0 text-[11px] text-rust">
                        {sendingId === friend.id ? "…" : "Отправить"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-ink/8 bg-ink/[0.02] p-2.5">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] text-muted">
                <MessageSquareText size={12} />
                В обсуждение
              </p>
              <div className="space-y-1">
                {canPrepareDiscussion && (
                  <button type="button" onClick={queueForDiscussion} className={rowButtonClass}>
                    <span>{discussionQueued ? "Подготовлено" : "Вставить в текущее обсуждение"}</span>
                    <span className="shrink-0 text-[11px] text-rust">ниже</span>
                  </button>
                )}
                <a href={discussionUrl()} className={rowButtonClass}>
                  <span>Открыть обсуждение книги</span>
                  <span className="shrink-0 text-[11px] text-rust">перейти</span>
                </a>
              </div>
              <div className="mt-2 rounded-2xl border border-ink/8 bg-white/80 p-2">
                <p className="mb-1 px-1 text-[11px] text-muted">Последние темы форума</p>
                {topicsLoading && <p className="px-2 py-2 text-xs text-muted">загрузка тем…</p>}
                {!topicsLoading && sortedTopics.length === 0 && (
                  <p className="px-2 py-2 text-xs text-muted">Пока нет открытых тем для отправки.</p>
                )}
                <ul className="max-h-44 space-y-1 overflow-y-auto">
                  {sortedTopics.map((topic) => (
                    <li key={topic.id} className="rounded-2xl border border-transparent px-2 py-2 hover:border-ink/10 hover:bg-ink/[0.02]">
                      <div className="flex items-start gap-2">
                        <button
                          type="button"
                          disabled={topicSendingId === topic.id}
                          onClick={() => void sendToTopic(topic.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <p className="truncate text-sm text-ink">{topic.title}</p>
                          {topic.documentTitle && (
                            <p className="mt-0.5 truncate text-[11px] text-muted">{topic.documentTitle}</p>
                          )}
                        </button>
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            disabled={topicSendingId === topic.id}
                            onClick={() => void sendToTopic(topic.id)}
                            className="text-[11px] text-rust"
                          >
                            {topicSendingId === topic.id ? "…" : "Отправить"}
                          </button>
                          <a href={`/discuss/${topic.id}#discussion-compose`} className="text-[11px] text-muted hover:text-ink">
                            Открыть
                          </a>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="px-3 pt-2 text-[11px] leading-5 text-muted">
                Карточка откроет у получателя нужную книгу, страницу, цитату или пометку.
              </p>
            </div>
          </div>
          {message && <p className="mt-2 text-[11px] text-muted">{message}</p>}
        </div>
      )}
    </div>
  );
}
