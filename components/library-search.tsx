"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search, X } from "lucide-react";
import { normalizeForSearch } from "@/lib/transliterate";
import { countLabel } from "@/lib/pluralize";

export type SearchableDocument = {
  id: string;
  title: string;
  alternateTitle: string | null;
  authorNames: string;
  categoryName: string;
  tagNames?: string;
};

export function LibrarySearch({
  documents,
  totalCount,
}: {
  documents: SearchableDocument[];
  totalCount: number;
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = normalizeForSearch(query);

  const results = useMemo(() => {
    if (!normalizedQuery) return [];

    return documents
      .filter((doc) =>
        [doc.title, doc.alternateTitle, doc.authorNames, doc.tagNames]
          .filter(Boolean)
          .some((value) => normalizeForSearch(value as string).includes(normalizedQuery)),
      )
      .slice(0, 6);
  }, [documents, normalizedQuery]);

  return (
    <div className="relative mx-auto w-full max-w-2xl">
      <div className="flex items-center gap-3 border border-ink/15 bg-[var(--surface)] px-4">
        <Search size={18} className="shrink-0 text-muted" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Найти книгу или автора — на русском или английском"
          className="h-12 w-full bg-transparent text-[15px] outline-none placeholder:text-muted/70"
          aria-label="Поиск по библиотеке"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="rounded p-1 text-muted transition-colors hover:bg-ink/5 hover:text-ink"
            aria-label="Очистить поиск"
          >
            <X size={16} />
          </button>
        )}
        <span className="hidden border border-ink/10 px-2 py-1 font-mono text-[10px] text-muted sm:block">
          {countLabel(totalCount, ["текст", "текста", "текстов"])}
        </span>
      </div>

      {normalizedQuery && (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 overflow-hidden border border-ink/12 bg-[var(--surface)] p-1.5 shadow-lg">
          {results.length ? (
            results.map((doc) => (
              <Link
                key={doc.id}
                href={`/documents/${doc.id}`}
                className="group flex items-center justify-between gap-4 px-3.5 py-3 transition-colors hover:bg-ink/[0.04]"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{doc.title}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {doc.authorNames || "Автор не указан"} · {doc.categoryName}
                  </span>
                </span>
                <ArrowRight
                  size={16}
                  className="shrink-0 text-muted transition-transform group-hover:translate-x-1"
                />
              </Link>
            ))
          ) : (
            <p className="px-4 py-6 text-center text-sm text-muted">
              Ничего не нашлось. Попробуйте другой запрос.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
