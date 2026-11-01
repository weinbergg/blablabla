"use client";

import { useEffect, useState } from "react";
import { Pencil, Reply, Send, Trash2, TriangleAlert } from "lucide-react";
import { MathText } from "@/components/math-text";
import { ReactionBar } from "@/components/reaction-bar";
import { ShareWithFriends } from "@/components/share-with-friends";
import { SharedMessageCard } from "@/components/shared-message-card";
import { RoleBadge, UserAvatar } from "@/components/user-avatar";
import type { ReactionCount, ReactionKey } from "@/lib/reactions";
import { parseShareMessage } from "@/lib/share-message";
import { useFeature } from "./feature-provider";
import { commentError } from "@/lib/comment-request";

export type ChatAuthor = {
  id: string;
  name: string;
  role?: string | null;
  avatarKey?: string | null;
  avatarColor?: string | null;
};

export type ChatMessageItem = {
  id: string;
  body: string;
  createdAt: string;
  updatedAt?: string | null;
  author: ChatAuthor;
  page?: number | null;
};

function buildShareUrl(page?: number | null, hash?: string) {
  if (typeof window === "undefined") return "/";
  const url = new URL(window.location.href);
  if (page != null && page >= 1) {
    url.searchParams.set("page", String(page));
  }
  if (hash) {
    url.hash = hash;
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

function formatWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ChatMessage({
  item,
  currentUserId,
  documentTitle,
  pageLabel = "стр.",
  compact = false,
  layout = "chat",
  shareUrl,
  privacy,
  forwardLabel,
  reactions,
  canReact = false,
  onReact,
  onJumpToPage,
  onReport,
  onReply,
  onEdit,
  onDelete,
}: {
  item: ChatMessageItem;
  currentUserId: string | null;
  documentTitle?: string | null;
  pageLabel?: string;
  compact?: boolean;
  layout?: "chat" | "discussion";
  shareUrl?: string;
  privacy?: "open" | "closed" | "both";
  forwardLabel?: string;
  reactions?: ReactionCount[];
  canReact?: boolean;
  onReact?: (key: ReactionKey) => void;
  onJumpToPage?: (page: number) => void;
  onReport?: (id: string) => void;
  onReply?: () => void;
  onEdit?: (body: string) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
}) {
  const channelsEnabled = useFeature("channels");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [channelNote, setChannelNote] = useState("");
  const [targeted, setTargeted] = useState(false);
  const isOwn = currentUserId === item.author.id;
  const sharedPayload = parseShareMessage(item.body);
  const anchorId = `comment-${item.id}`;

  useEffect(() => {
    function syncTarget() {
      if (typeof window === "undefined") return;
      const active = window.location.hash === `#${anchorId}`;
      setTargeted(active);
      if (!active) return;
      const node = document.getElementById(anchorId);
      if (!node) return;
      node.scrollIntoView({ block: "center", behavior: "smooth" });
      window.setTimeout(() => setTargeted(false), 2600);
    }
    syncTarget();
    window.addEventListener("hashchange", syncTarget);
    return () => window.removeEventListener("hashchange", syncTarget);
  }, [anchorId]);

  async function save() {
    if (!onEdit || !draft.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await onEdit(draft.trim());
      setEditing(false);
    } catch (failure) {
      setError(commentError(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      id={anchorId}
      className={`${layout === "discussion" ? "flex gap-3 sm:gap-5" : `chat-bubble ${isOwn ? "chat-bubble-own" : ""} ${compact ? "chat-bubble-compact" : ""}`} group ${
        targeted ? "rounded-2xl ring-2 ring-rust/45 ring-offset-2 ring-offset-paper" : ""
      }`}
    >
      <UserAvatar
        userId={item.author.id}
        avatarKey={item.author.avatarKey}
        avatarColor={item.author.avatarColor}
        name={item.author.name}
        size={compact ? 32 : 42}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <span className="font-medium text-ink">{item.author.name}</span>
          {item.author.role && <RoleBadge role={item.author.role} />}
          {item.page != null &&
            (onJumpToPage ? (
              <button
                type="button"
                onClick={() => onJumpToPage(item.page!)}
                className="rounded-md bg-ink/5 px-2 py-0.5 font-mono text-[10px] hover:bg-rust/15 hover:text-rust"
              >
                {pageLabel} {item.page}
              </button>
            ) : (
              <span className="rounded-md bg-ink/5 px-2 py-0.5 font-mono text-[10px]">
                {pageLabel} {item.page}
              </span>
            ))}
          <span>{formatWhen(item.createdAt)}</span>
          {item.updatedAt && <span className="text-[10px]">изм.</span>}
          {!isOwn && onReport && (
            <button
              type="button"
              onClick={() => onReport(item.id)}
              className="ml-auto opacity-0 transition-opacity hover:text-rust group-hover:opacity-100"
              aria-label="Пожаловаться"
            >
              <TriangleAlert size={15} />
            </button>
          )}
        </div>
        {compact ? (
          <p className="mt-1 truncate text-sm text-ink/70">
            {(sharedPayload ? sharedPayload.excerpt || sharedPayload.title : item.body).replace(/\s+/g, " ")}
          </p>
        ) : editing ? (
          <form
            className="mt-2 flex items-start gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <textarea
              value={draft}
              disabled={busy}
              onChange={(event) => setDraft(event.target.value)}
              rows={3}
              className="flex-1 rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm outline-none focus:border-ink/40"
            />
            <button type="submit" className="icon-button" disabled={busy} aria-label="Сохранить">
              <Send size={16} />
            </button>
          </form>
        ) : (
          <div className="mt-1.5">
            {sharedPayload ? (
              <SharedMessageCard payload={sharedPayload} />
            ) : (
              <MathText source={item.body} className={layout === "discussion" ? "text-base leading-8" : "text-sm leading-6"} />
            )}
          </div>
        )}
        {error && <p role="alert" className="mt-2 text-xs text-rust">{error}</p>}
        {!compact && !editing && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-3">
            <ShareWithFriends
              compact
              privacy={privacy}
              buttonLabel={forwardLabel ?? "Поделиться"}
              buttonClassName="!min-h-0 !gap-1 !border-0 !px-0 !text-[12px] !font-normal shadow-none"
              payload={
                sharedPayload ?? {
                  kind: "quote",
                  title:
                    item.page != null
                      ? `${documentTitle || "Книга"} · ${pageLabel} ${item.page}`
                      : documentTitle || "Сообщение",
                  url: shareUrl ?? buildShareUrl(item.page, anchorId),
                  excerpt: item.body,
                }
              }
            />
            {currentUserId && channelsEnabled && (
              <button
                type="button"
                className="text-[12px] text-muted hover:text-ink"
                title={
                  privacy === "closed"
                    ? "В канал уйдёт текст, без ссылки на личный разговор"
                    : "Переслать в свой канал"
                }
                onClick={async () => {
                  const payload = sharedPayload ?? {
                    title:
                      item.page != null
                        ? `${documentTitle || "Книга"} · ${pageLabel} ${item.page}`
                        : documentTitle || "Сообщение",
                    url: shareUrl ?? buildShareUrl(item.page),
                    excerpt: item.body,
                  };
                  if (privacy === "closed") {
                    const ok = window.confirm(
                      "В канал уйдёт только этот текст. Ссылки на личный разговор не будет.",
                    );
                    if (!ok) return;
                  }
                  const href = payload.url && !payload.url.includes("/messages") ? payload.url : null;
                  const documentId = href?.match(/^\/documents\/([^/?#]+)/)?.[1] ?? null;
                  const response = await fetch("/api/channels/forward", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      title: payload.title,
                      excerpt: payload.excerpt,
                      url: href,
                      documentId,
                    }),
                  });
                  const data = (await response.json().catch(() => ({}))) as { error?: string; slug?: string };
                  setChannelNote(response.ok ? "В канале" : data.error || "Не вышло");
                }}
              >
                В канал
              </button>
            )}
            {channelNote && <span className="text-[12px] text-muted">{channelNote}</span>}
            {onReply && (
              <button
                type="button"
                onClick={onReply}
                className="inline-flex items-center gap-1 text-[12px] text-muted hover:text-ink"
              >
                <Reply size={15} />
                Ответить
              </button>
            )}
            {onEdit && !sharedPayload && (
              <button
                type="button"
                onClick={() => {
                  setDraft(item.body);
                  setError("");
                  setEditing(true);
                }}
                className="inline-flex items-center gap-1 text-[12px] text-muted hover:text-ink"
              >
                <Pencil size={15} />
                Изменить
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try { await onDelete(); }
                  catch (failure) { setError(commentError(failure)); }
                  finally { setBusy(false); }
                }}
                className="inline-flex items-center gap-1 text-[12px] text-muted hover:text-rust"
              >
                <Trash2 size={15} />
                Удалить
              </button>
            )}
          </div>
        )}
        {!compact && (canReact || (reactions && reactions.length > 0)) ? (
          <ReactionBar counts={reactions ?? []} canReact={canReact} onToggle={onReact} />
        ) : null}
      </div>
    </div>
  );
}
