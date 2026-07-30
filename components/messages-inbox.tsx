"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, MessageSquarePlus, Send, Users, X } from "lucide-react";
import type { ConversationSummary } from "@/lib/db/messages";

function conversationLabel(conversation: ConversationSummary) {
  if (conversation.title) return conversation.title;
  if (conversation.otherParticipants.length === 0) return "Заметки для себя";
  return conversation.otherParticipants.map((p) => p.name).join(", ");
}

function timeAgo(iso: string) {
  const date = new Date(`${iso.replace(" ", "T")}Z`);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "сейчас";
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} дн назад`;
  return date.toLocaleDateString("ru-RU");
}

export function MessagesInbox({
  conversations,
  currentUserId,
}: {
  conversations: ConversationSummary[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [composing, setComposing] = useState(false);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-widest text-muted">
          {conversations.length ? `${conversations.length} диалогов` : "Пока нет диалогов"}
        </span>
        <button type="button" onClick={() => setComposing(true)} className="button-primary">
          <MessageSquarePlus size={15} />
          Новое сообщение
        </button>
      </div>

      {conversations.length === 0 ? (
        <p className="rounded-2xl border border-ink/10 bg-ink/[0.02] p-8 text-center text-sm text-muted">
          Здесь появятся личные переписки с другими участниками библиотеки — начните первую.
        </p>
      ) : (
        <div className="divide-y divide-ink/10 rounded-2xl border border-ink/10">
          {conversations.map((conversation) => (
            <Link
              key={conversation.id}
              href={`/messages/${conversation.id}`}
              className="flex items-center gap-4 p-4 transition-colors hover:bg-ink/[0.03] md:p-5"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ink/8 text-ink">
                {conversation.otherParticipants.length > 1 ? <Users size={16} /> : conversationLabel(conversation).charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-medium">{conversationLabel(conversation)}</span>
                  {conversation.unreadCount > 0 && (
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-rust text-[10px] font-semibold text-white">
                      {conversation.unreadCount}
                    </span>
                  )}
                </span>
                <span className="block truncate text-sm text-muted">
                  {conversation.lastMessage
                    ? `${conversation.lastMessage.authorId === currentUserId ? "Вы: " : ""}${conversation.lastMessage.body}`
                    : "Пока нет сообщений"}
                </span>
              </span>
              {conversation.lastMessage && (
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-muted">
                  {timeAgo(conversation.lastMessage.createdAt)}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}

      {composing && (
        <NewConversationModal
          onClose={() => setComposing(false)}
          onCreated={(conversationId) => {
            setComposing(false);
            router.push(`/messages/${conversationId}`);
          }}
        />
      )}
    </div>
  );
}

type UserOption = { id: string; name: string };

function NewConversationModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (conversationId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserOption[]>([]);
  const [selected, setSelected] = useState<UserOption[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const response = await fetch(`/api/users/search?q=${encodeURIComponent(query.trim())}`);
      if (!response.ok) return;
      const data = (await response.json()) as { users: UserOption[] };
      setResults(data.users.filter((u) => !selected.some((s) => s.id === u.id)));
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, selected]);

  const canSend = selected.length > 0 && body.trim().length > 0 && !busy;

  async function submit() {
    if (!canSend) return;
    setBusy(true);
    setError("");
    const response = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        participantIds: selected.map((u) => u.id),
        title: selected.length > 1 ? selected.map((u) => u.name).join(", ") : undefined,
        body: body.trim(),
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(result.error || "Не получилось отправить сообщение.");
      setBusy(false);
      return;
    }
    onCreated(result.conversationId as string);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-ink/10 bg-paper p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-2xl">Новое сообщение</h2>
          <button type="button" onClick={onClose} className="icon-button" aria-label="Закрыть">
            <X size={15} />
          </button>
        </div>

        <div className="field mb-3">
          <span>Кому</span>
          {selected.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {selected.map((user) => (
                <span key={user.id} className="flex items-center gap-1 rounded-full bg-ink/8 px-2.5 py-1 text-xs">
                  {user.name}
                  <button
                    type="button"
                    onClick={() => setSelected((current) => current.filter((u) => u.id !== user.id))}
                    aria-label={`Убрать ${user.name}`}
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Введите имя участника…"
            autoFocus
          />
          {results.length > 0 && (
            <div className="mt-1.5 max-h-40 overflow-y-auto rounded-lg border border-ink/10">
              {results.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-ink/5"
                  onClick={() => {
                    setSelected((current) => [...current, user]);
                    setQuery("");
                    setResults([]);
                  }}
                >
                  {user.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <label className="field">
          <span>Сообщение</span>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={4}
            placeholder="Напишите первое сообщение…"
          />
        </label>

        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

        <button type="button" onClick={submit} disabled={!canSend} className="button-primary mt-4 w-full">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          Отправить
        </button>
      </div>
    </div>
  );
}
