"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search, X } from "lucide-react";
import { languageLabel } from "@/lib/languages";
import { countLabel } from "@/lib/pluralize";
import { scoreSearchDocument } from "@/lib/search";

export type SearchableDocument = {
  id: string;
  title: string;
  alternateTitle: string | null;
  authorNames: string;
  subjectNames?: string;
  categoryName: string;
  categoryPath?: string;
  tagNames?: string;
  language?: string | null;
};

/** Hero search — ranks by author/title/category/tags with RU↔EN aliases. */
export function LibrarySearch({
  documents,
  totalCount,
}: {
  documents: SearchableDocument[];
  totalCount: number;
}) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return documents
      .map((doc) => ({
        doc,
        score: scoreSearchDocument(
          {
            title: doc.title,
            alternateTitle: doc.alternateTitle,
            authorNames: doc.authorNames,
            subjectNames: doc.subjectNames,
            categoryPath: doc.categoryPath || doc.categoryName,
            tagNames: doc.tagNames,
          },
          q,
        ),
      }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title, "ru"))
      .slice(0, 8)
      .map((row) => row.doc);
  }, [documents, query]);

  const active = query.trim().length > 0;

  return (
    <div className="relative mx-auto w-full max-w-2xl">
      <div className="flex items-center gap-3 rounded-xl border border-ink/15 bg-white/60 px-4 shadow-[0_12px_40px_rgba(25,31,40,0.06)] backdrop-blur dark:bg-white/5 dark:shadow-none">
        <Search size={19} className="shrink-0 text-muted" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Автор, книга, раздел… на русском или английском"
          className="h-14 w-full bg-transparent text-[15px] outline-none placeholder:text-muted/70"
          aria-label="Поиск по библиотеке"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="rounded-md p-1 text-muted transition-colors hover:bg-ink/5 hover:text-ink"
            aria-label="Очистить поиск"
          >
            <X size={16} />
          </button>
        )}
        <span className="hidden shrink-0 rounded-md border border-ink/10 px-2 py-1 font-mono text-[10px] text-muted sm:block">
          {countLabel(totalCount, ["текст", "текста", "текстов"])}
        </span>
      </div>

      {active && (
        <div className="absolute left-0 right-0 top-[calc(100%+10px)] z-20 overflow-hidden rounded-2xl border border-ink/10 bg-[#fbfaf7] p-2 text-left shadow-2xl dark:bg-[#1b1e25]">
          {results.length ? (
            results.map((doc) => (
              <Link
                key={doc.id}
                href={`/documents/${doc.id}`}
                className="group flex items-center justify-between gap-4 rounded-xl px-4 py-3 text-left transition-colors hover:bg-ink/[0.045]"
              >
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate font-medium">{doc.title}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {doc.authorNames || "Автор не указан"}
                    {doc.categoryPath || doc.categoryName
                      ? ` · ${doc.categoryPath || doc.categoryName}`
                      : ""}
                    {doc.language ? ` · ${languageLabel(doc.language)}` : ""}
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
              Ничего не нашлось. Попробуйте автора, название или раздел каталога.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
