"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";

export function ForumTopicForm({
  documentId,
  documentTitle,
}: {
  documentId?: string | null;
  documentTitle?: string | null;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(
    documentTitle ? `О тексте: ${documentTitle.slice(0, 80)}` : "",
  );
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/forum/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        body: body.trim(),
        documentId: documentId || null,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
    setBusy(false);
    if (!res.ok || !data.id) {
      setError(data.error || "Не удалось создать тему.");
      return;
    }
    router.push(`/discuss/${data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-ink/10 bg-ink/[0.02] p-4 md:p-5">
      <p className="font-serif text-xl tracking-tight">Новая тема</p>
      <p className="text-sm leading-6 text-muted">
        Для разговоров шире одной страницы книги: параллели между текстами, переводы,
        споры о терминах. Под конкретной книгой по-прежнему удобны комментарии к месту.
      </p>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="О чём речь"
        className="w-full rounded-xl border border-ink/15 bg-paper px-3 py-2.5 text-sm outline-none focus:border-ink/40"
        required
        maxLength={160}
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Начните мысль… Можно формулы: $E=mc^2$"
        rows={5}
        className="w-full rounded-xl border border-ink/15 bg-paper px-3 py-2.5 text-sm outline-none focus:border-ink/40"
        required
      />
      {documentTitle && (
        <p className="text-xs text-muted">
          Привязка к тексту: <span className="text-ink">{documentTitle}</span>
        </p>
      )}
      {error && <p className="text-sm text-rust">{error}</p>}
      <button type="submit" className="button-primary" disabled={busy}>
        <Send size={14} />
        Открыть тему
      </button>
    </form>
  );
}
