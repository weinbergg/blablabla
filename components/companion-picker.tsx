"use client";

import { useEffect, useState } from "react";
import { Columns2, Search } from "lucide-react";
import type { CompanionHit, CompanionSuggestions } from "@/lib/db/companion-suggestions";
import { languageLabel } from "@/lib/languages";

export type CompanionOption = {
  id: string;
  title: string;
  roleLabel: string;
  language: string | null;
};

type SearchHit = {
  id: string;
  title: string;
  authorNames: string;
  language: string | null;
};

export function CompanionPicker({
  companionId,
  editions,
  suggestions,
  onPick,
}: {
  companionId: string | null;
  editions: CompanionOption[];
  suggestions: CompanionSuggestions;
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const handle = window.setTimeout(async () => {
      const response = await fetch(`/api/catalog/search?q=${encodeURIComponent(q)}`);
      if (!response.ok) return;
      const data = (await response.json()) as { documents: SearchHit[] };
      setResults(data.documents ?? []);
    }, 200);
    return () => window.clearTimeout(handle);
  }, [query]);

  const groups: { title: string; items: CompanionHit[] }[] = [
    { title: "Издания и переводы", items: editions },
    { title: "Словари", items: suggestions.dictionaries },
    { title: "Справочники", items: suggestions.references },
    { title: "Тот же автор", items: suggestions.sameAuthor },
    { title: "Тот же раздел", items: suggestions.sameSection },
    { title: "Советы бустеров и админов", items: suggestions.staffPicks },
  ].filter((group) => group.items.length > 0);

  function pick(id: string) {
    onPick(id);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-full border border-rust/35 bg-rust/10 px-3 py-1.5 text-xs text-ink"
      >
        <Columns2 size={15} className="text-rust" />
        <span className="font-medium">Параллельное чтение</span>
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-ink/10 bg-paper p-3 shadow-xl">
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-ink/10 px-3 py-2">
            <Search size={14} className="text-muted" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Найти книгу в библиотеке…"
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => pick("")}
            className={`mb-2 w-full rounded-xl px-3 py-2 text-left text-sm ${
              !companionId ? "bg-ink/[0.04] text-ink" : "text-muted hover:bg-ink/[0.03]"
            }`}
          >
            Обычный режим
          </button>
          <div className="max-h-80 overflow-y-auto">
            {query.trim() ? (
              <ul className="space-y-1">
                {results.length === 0 && <li className="px-3 py-2 text-sm text-muted">Ничего не нашлось.</li>}
                {results.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => pick(item.id)}
                      className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-ink/[0.04]"
                    >
                      <span className="block truncate">{item.title}</span>
                      <span className="block font-mono text-[10px] text-muted">
                        {item.authorNames}
                        {item.language ? ` · ${languageLabel(item.language)}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              groups.map((group) => (
                <section key={group.title} className="mb-3">
                  <p className="mb-1 px-1 font-mono text-[10px] uppercase tracking-widest text-muted">
                    {group.title}
                  </p>
                  <ul>
                    {group.items.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => pick(item.id)}
                          className={`w-full rounded-xl px-3 py-1.5 text-left text-sm hover:bg-ink/[0.04] ${
                            companionId === item.id ? "text-rust" : ""
                          }`}
                        >
                          <span className="block truncate">{item.title}</span>
                          <span className="block font-mono text-[10px] text-muted">{item.roleLabel}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
