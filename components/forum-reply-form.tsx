"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";

export function ForumReplyForm({ topicId }: { topicId: string }) {
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
      body: JSON.stringify({ body: body.trim() }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Не удалось отправить.");
      return;
    }
    setBody("");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-3">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Ответить в теме…"
        rows={3}
        className="w-full rounded-xl border border-ink/15 bg-paper px-3 py-2.5 text-sm outline-none focus:border-ink/40"
      />
      {error && <p className="text-sm text-rust">{error}</p>}
      <button type="submit" className="button-secondary" disabled={busy || !body.trim()}>
        <Send size={14} />
        Ответить
      </button>
    </form>
  );
}
