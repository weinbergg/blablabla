"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search, X } from "lucide-react";
import { LANGUAGES, languageLabel } from "@/lib/languages";
import { normalizeForSearch } from "@/lib/transliterate";
import { countLabel } from "@/lib/pluralize";

export type SearchableDocument = {
  id: string;
  title: string;
  alternateTitle: string | null;
  authorNames: string;
  categoryName: string;
  tagNames?: string;
  language?: string | null;
};

export function LibrarySearch({
  documents,
  totalCount,
}: {
  documents: SearchableDocument[];
  totalCount: number;
}) {
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("");
  const normalizedQuery = normalizeForSearch(query);

  const usedLanguages = useMemo(
    () => LANGUAGES.filter((lang) => documents.some((doc) => doc.language === lang.code)),
    [documents],
  );

  const results = useMemo(() => {
    if (!normalizedQuery) return [];

    return documents
      .filter((doc) => {
        if (language && doc.language !== language) return false;
        return [doc.title, doc.alternateTitle, doc.authorNames, doc.tagNames]
          .filter(Boolean)
          .some((value) => normalizeForSearch(value as string).includes(normalizedQuery));
      })
      .slice(0, 6);
  }, [documents, normalizedQuery, language]);

  return (
    <div className="relative mx-auto w-full max-w-2xl">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-ink/15 bg-white/60 px-4 shadow-[0_12px_40px_rgba(25,31,40,0.06)] backdrop-blur dark:bg-white/5 dark:shadow-none">
          <Search size={19} className="shrink-0 text-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Найти книгу или автора — на русском или английском"
            className="h-12 w-full bg-transparent text-[15px] outline-none placeholder:text-muted/70 sm:h-14"
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
        {usedLanguages.length > 1 && (
          <label className="flex shrink-0 flex-col justify-center gap-1 sm:w-44">
            <span className="sr-only">Язык</span>
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              className="filter-control h-12 w-full rounded-xl px-3 text-sm sm:h-14"
              aria-label="Фильтр по языку"
            >
              <option value="">Все языки</option>
              {usedLanguages.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {languageLabel(lang.code)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {normalizedQuery && (
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
                    {doc.authorNames || "Автор не указан"} · {doc.categoryName}
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
              Ничего не нашлось. Попробуйте другой запрос.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
