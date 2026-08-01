"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CheckCheck, Send } from "lucide-react";

export type ThreadMessage = {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  authorName: string;
};

function formatTime(iso: string) {
  const date = new Date(`${iso.replace(" ", "T")}Z`);
  return date.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function isReadByPeer(messageCreatedAt: string, peerLastReadAt: string | null) {
  if (!peerLastReadAt) return false;
  return messageCreatedAt <= peerLastReadAt;
}

export function MessageThread({
  conversationId,
  initialMessages,
  currentUserId,
  initialPeerLastReadAt = null,
}: {
  conversationId: string;
  initialMessages: ThreadMessage[];
  currentUserId: string;
  initialPeerLastReadAt?: string | null;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [peerLastReadAt, setPeerLastReadAt] = useState<string | null>(initialPeerLastReadAt);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/messages/${conversationId}`, { method: "PATCH", credentials: "same-origin" });
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  // Light polling keeps a conversation feeling alive without adding a
  // websocket layer to an otherwise fully request/response app — good
  // enough for a small invite-only community, not built for high frequency.
  useEffect(() => {
    const interval = setInterval(async () => {
      const response = await fetch(`/api/messages/${conversationId}`, { credentials: "same-origin" });
      if (!response.ok) return;
      const data = (await response.json()) as { messages: ThreadMessage[]; peerLastReadAt?: string | null };
      setMessages(data.messages);
      if (data.peerLastReadAt !== undefined) setPeerLastReadAt(data.peerLastReadAt);
      // Keep unread badge clear while the thread is open.
      fetch(`/api/messages/${conversationId}`, { method: "PATCH", credentials: "same-origin" });
    }, 8000);
    return () => clearInterval(interval);
  }, [conversationId]);

  async function submit() {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    setBody("");
    const response = await fetch(`/api/messages/${conversationId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ body: text }),
    });
    setBusy(false);
    if (!response.ok) {
      setBody(text);
      return;
    }
    const refreshed = await fetch(`/api/messages/${conversationId}`, { credentials: "same-origin" });
    if (refreshed.ok) {
      const data = (await refreshed.json()) as { messages: ThreadMessage[]; peerLastReadAt?: string | null };
      setMessages(data.messages);
      if (data.peerLastReadAt !== undefined) setPeerLastReadAt(data.peerLastReadAt);
    }
  }

  return (
    <div className="rounded-2xl border border-ink/10">
      <div className="flex max-h-[60vh] min-h-[320px] flex-col gap-3 overflow-y-auto p-5">
        {messages.length === 0 && (
          <p className="my-auto text-center text-sm text-muted">Начните переписку — напишите первое сообщение.</p>
        )}
        {messages.map((message) => {
          const mine = message.authorId === currentUserId;
          const read = mine && isReadByPeer(message.createdAt, peerLastReadAt);
          return (
            <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${mine ? "bg-ink text-paper" : "bg-ink/6"}`}>
                {!mine && <p className="mb-0.5 text-xs font-medium opacity-70">{message.authorName}</p>}
                <p className="whitespace-pre-wrap leading-6">{message.body}</p>
                <p
                  className={`mt-1 flex items-center gap-1.5 text-[10px] uppercase tracking-widest ${
                    mine ? "justify-end text-paper/50" : "text-muted"
                  }`}
                >
                  <span>{formatTime(message.createdAt)}</span>
                  {mine &&
                    (read ? (
                      <span className="inline-flex items-center gap-0.5 normal-case tracking-normal text-paper/70" title="Прочитано">
                        <CheckCheck size={12} strokeWidth={2.25} />
                        <span className="sr-only">Прочитано</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 normal-case tracking-normal text-paper/45" title="Доставлено">
                        <Check size={12} strokeWidth={2.25} />
                        <span className="sr-only">Доставлено</span>
                      </span>
                    ))}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="flex items-end gap-2 border-t border-ink/10 p-3"
      >
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder="Напишите сообщение…"
          className="flex-1 resize-none rounded-xl border border-ink/15 bg-white/60 px-3.5 py-2.5 text-sm outline-none focus:border-ink/40 dark:bg-white/5"
        />
        <button type="submit" className="icon-button" disabled={busy || !body.trim()} aria-label="Отправить">
          <Send size={15} />
        </button>
      </form>
    </div>
  );
}
