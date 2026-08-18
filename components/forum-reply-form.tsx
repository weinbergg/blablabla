"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";

export function ForumReplyForm({
  topicId,
  parentId = null,
  compact = false,
  onDone,
}: {
  topicId: string;
  parentId?: string | null;
  compact?: boolean;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/forum/topics/${topicId}/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: body.trim(), parentId }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Не удалось отправить.");
      return;
    }
    setBody("");
    onDone?.();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className={compact ? "mt-3 space-y-2" : "mt-8 space-y-3"}>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={parentId ? "Ответить в нити…" : "Ответить в теме…"}
        rows={compact ? 2 : 3}
        className="w-full rounded-xl border border-ink/15 bg-paper px-3 py-2.5 text-sm outline-none focus:border-ink/40"
        autoFocus={compact}
      />
      {error && <p className="text-sm text-rust">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" className="button-secondary" disabled={busy || !body.trim()}>
          <Send size={14} />
          Ответить
        </button>
        {compact && onDone && (
          <button type="button" onClick={onDone} className="text-xs text-muted hover:text-ink">
            Отмена
          </button>
        )}
      </div>
    </form>
  );
}
