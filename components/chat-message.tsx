"use client";

import { useEffect, useState } from "react";
import { Pencil, Reply, Send, Trash2, TriangleAlert } from "lucide-react";
import { MathText } from "@/components/math-text";
import { ShareWithFriends } from "@/components/share-with-friends";
import { SharedMessageCard } from "@/components/shared-message-card";
import { RoleBadge, UserAvatar } from "@/components/user-avatar";
import { parseShareMessage } from "@/lib/share-message";

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
  onJumpToPage?: (page: number) => void;
  onReport?: (id: string) => void;
  onReply?: () => void;
  onEdit?: (body: string) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.body);
  const [busy, setBusy] = useState(false);
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
    if (!onEdit || !draft.trim()) return;
    setBusy(true);
    await onEdit(draft.trim());
    setBusy(false);
    setEditing(false);
  }

  return (
    <div
      id={anchorId}
      className={`chat-bubble group ${isOwn ? "chat-bubble-own" : ""} ${compact ? "chat-bubble-compact" : ""} ${
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
              <MathText source={item.body} className="text-sm leading-6" />
            )}
          </div>
        )}
        {!compact && !editing && (
          <div className="mt-2 flex gap-3">
            <ShareWithFriends
              compact
              buttonLabel="Поделиться"
              buttonClassName="!min-h-0 !gap-1 !border-0 !px-0 !text-[12px] !font-normal shadow-none"
              payload={
                sharedPayload ?? {
                  kind: "quote",
                  title:
                    item.page != null
                      ? `${documentTitle || "Книга"} · ${pageLabel} ${item.page}`
                      : documentTitle || "Комментарий",
                  url: buildShareUrl(item.page),
                  excerpt: item.body,
                }
              }
            />
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
                onClick={() => void onDelete()}
                className="inline-flex items-center gap-1 text-[12px] text-muted hover:text-rust"
              >
                <Trash2 size={15} />
                Удалить
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
