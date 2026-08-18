"use client";

import { useState } from "react";
import { Pencil, Reply, Send, Trash2, TriangleAlert } from "lucide-react";
import { MathText } from "@/components/math-text";
import { RoleBadge, UserAvatar } from "@/components/user-avatar";

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
  const isOwn = currentUserId === item.author.id;

  async function save() {
    if (!onEdit || !draft.trim()) return;
    setBusy(true);
    await onEdit(draft.trim());
    setBusy(false);
    setEditing(false);
  }

  return (
    <div className={`chat-bubble group ${isOwn ? "chat-bubble-own" : ""} ${compact ? "chat-bubble-compact" : ""}`}>
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
          <p className="mt-1 truncate text-sm text-ink/70">{item.body.replace(/\s+/g, " ")}</p>
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
          <MathText source={item.body} className="mt-1.5 text-sm leading-6" />
        )}
        {!compact && !editing && (onReply || onEdit || onDelete) && (
          <div className="mt-2 flex gap-3">
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
            {onEdit && (
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
