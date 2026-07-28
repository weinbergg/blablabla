"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search, X } from "lucide-react";
import type {
  Category,
  LibraryDocument,
  Subcategory,
} from "@/lib/types";

type Props = {
  documents: LibraryDocument[];
  categories: Category[];
  subcategories: Subcategory[];
};

export function LibrarySearch({
  documents,
  categories,
  subcategories,
}: Props) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase("ru");

  const results = useMemo(() => {
    if (!normalizedQuery) return [];

    return documents
      .filter((document) =>
        [
          document.title,
          document.author,
          document.description,
          document.year,
        ]
          .filter(Boolean)
          .some((value) =>
            value!.toLocaleLowerCase("ru").includes(normalizedQuery),
          ),
      )
      .slice(0, 5);
  }, [documents, normalizedQuery]);

  function getCategory(document: LibraryDocument) {
    return categories.find((item) => item.id === document.categoryId);
  }

  function getSubcategory(document: LibraryDocument) {
    return subcategories.find((item) => item.id === document.subcategoryId);
  }

  return (
    <div className="relative mx-auto w-full max-w-2xl">
      <div className="flex items-center gap-3 rounded-full border border-ink/15 bg-white/60 px-5 shadow-[0_12px_40px_rgba(25,31,40,0.06)] backdrop-blur">
        <Search size={19} className="shrink-0 text-muted" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Найти книгу, автора или тему"
          className="h-14 w-full bg-transparent text-[15px] outline-none placeholder:text-muted/70"
          aria-label="Поиск по библиотеке"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="rounded-full p-1 text-muted transition-colors hover:bg-ink/5 hover:text-ink"
            aria-label="Очистить поиск"
          >
            <X size={16} />
          </button>
        )}
        <span className="hidden rounded-md border border-ink/10 px-2 py-1 font-mono text-[10px] text-muted sm:block">
          {documents.length} текстов
        </span>
      </div>

      {normalizedQuery && (
        <div className="absolute left-0 right-0 top-[calc(100%+10px)] z-20 overflow-hidden rounded-2xl border border-ink/10 bg-[#fbfaf7] p-2 shadow-2xl">
          {results.length ? (
            results.map((document) => {
              const category = getCategory(document);
              const subcategory = getSubcategory(document);

              return (
                <Link
                  key={document.id}
                  href={
                    document.fileUrl ||
                    `/catalog/${category?.slug || "philosophy"}`
                  }
                  className="group flex items-center justify-between gap-4 rounded-xl px-4 py-3 transition-colors hover:bg-ink/[0.045]"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {document.title}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted">
                      {document.author} · {subcategory?.name}
                    </span>
                  </span>
                  <ArrowRight
                    size={16}
                    className="shrink-0 text-muted transition-transform group-hover:translate-x-1"
                  />
                </Link>
              );
            })
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
