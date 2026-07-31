"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";

type Entry = {
  id: string;
  term: string;
  definition: string;
  notes: string | null;
  aliases: string | null;
};

export function GlossaryDetailClient({
  glossaryId,
  canEdit,
  initialEntries,
}: {
  glossaryId: string;
  canEdit: boolean;
  initialEntries: Entry[];
}) {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [definition, setDefinition] = useState("");
  const [notes, setNotes] = useState("");
  const [aliases, setAliases] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addEntry(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/glossaries/${glossaryId}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term, definition, notes: notes || null, aliases: aliases || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Ошибка");
        return;
      }
      setTerm("");
      setDefinition("");
      setNotes("");
      setAliases("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(entryId: string) {
    if (!confirm("Удалить эту запись?")) return;
    await fetch(`/api/glossaries/${glossaryId}/entries/${entryId}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-8">
      {canEdit && (
        <form onSubmit={addEntry} className="space-y-3 rounded-2xl border border-ink/10 p-5">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted">Новая запись</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Термин
              <input
                className="mt-1 w-full rounded-xl border border-ink/15 bg-transparent px-3 py-2"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                required
                placeholder="λόγος, ∇, compact…"
              />
            </label>
            <label className="text-sm">
              Варианты / склонения
              <input
                className="mt-1 w-full rounded-xl border border-ink/15 bg-transparent px-3 py-2"
                value={aliases}
                onChange={(e) => setAliases(e.target.value)}
                placeholder="λόγου, λόγω — через запятую"
              />
            </label>
          </div>
          <label className="block text-sm">
            Определение
            <textarea
              className="mt-1 w-full rounded-xl border border-ink/15 bg-transparent px-3 py-2"
              value={definition}
              onChange={(e) => setDefinition(e.target.value)}
              required
              rows={3}
            />
          </label>
          <label className="block text-sm">
            Примеры / формулы
            <textarea
              className="mt-1 w-full rounded-xl border border-ink/15 bg-transparent px-3 py-2"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </label>
          {error && <p className="text-sm text-rust">{error}</p>}
          <button type="submit" disabled={busy} className="rounded-full bg-ink px-4 py-2 text-sm text-paper">
            {busy ? "…" : "Добавить"}
          </button>
        </form>
      )}

      <ul className="divide-y divide-ink/10 rounded-2xl border border-ink/10">
        {initialEntries.length === 0 && (
          <li className="px-5 py-8 text-center text-sm text-muted">Пока пусто.</li>
        )}
        {initialEntries.map((entry) => (
          <li key={entry.id} className="group flex gap-3 px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{entry.term}</p>
              {entry.aliases && (
                <p className="mt-0.5 font-mono text-[11px] text-muted">{entry.aliases}</p>
              )}
              <p className="mt-1 text-sm leading-6">{entry.definition}</p>
              {entry.notes && (
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted">{entry.notes}</p>
              )}
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={() => remove(entry.id)}
                className="icon-button size-8 shrink-0 opacity-0 group-hover:opacity-100"
                aria-label="Удалить"
              >
                <Trash2 size={13} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
