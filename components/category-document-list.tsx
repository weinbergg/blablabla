"use client";

import { useMemo, useState } from "react";
import { DocumentRow } from "@/components/document-row";
import { LANGUAGES, languageLabel } from "@/lib/languages";
import type { AuthorRow, DocumentRow as DocumentRowType } from "@/lib/db/queries";

type Doc = DocumentRowType & { authors: AuthorRow[] };

/** Client-side language/bilingual filter for a category's document list —
 * the catalog itself is small enough per category that filtering in the
 * browser (rather than a server round-trip) keeps this snappy. */
export function CategoryDocumentList({ documents }: { documents: Doc[] }) {
  const [language, setLanguage] = useState("");
  const [bilingualOnly, setBilingualOnly] = useState(false);

  const usedLanguages = useMemo(
    () => LANGUAGES.filter((l) => documents.some((d) => d.language === l.code)),
    [documents],
  );
  const hasBilingual = useMemo(() => documents.some((d) => d.secondaryLanguage), [documents]);

  const filtered = useMemo(
    () =>
      documents.filter((d) => {
        if (language && d.language !== language) return false;
        if (bilingualOnly && !d.secondaryLanguage) return false;
        return true;
      }),
    [documents, language, bilingualOnly],
  );

  const filtersActive = language || bilingualOnly;
  const showFilters = usedLanguages.length > 1 || hasBilingual;

  return (
    <div>
      {showFilters && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {usedLanguages.length > 1 && (
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              className="rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs dark:bg-white/5"
            >
              <option value="">Все языки</option>
              {usedLanguages.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {languageLabel(lang.code)}
                </option>
              ))}
            </select>
          )}
          {hasBilingual && (
            <label className="flex items-center gap-1.5 rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs dark:bg-white/5">
              <input
                type="checkbox"
                checked={bilingualOnly}
                onChange={(event) => setBilingualOnly(event.target.checked)}
              />
              только билингва
            </label>
          )}
          {filtersActive && (
            <button
              type="button"
              onClick={() => {
                setLanguage("");
                setBilingualOnly(false);
              }}
              className="text-xs text-muted underline underline-offset-2 hover:text-ink"
            >
              Сбросить
            </button>
          )}
          {filtersActive && (
            <span className="font-mono text-[10px] text-muted">
              {filtered.length} из {documents.length}
            </span>
          )}
        </div>
      )}

      {filtered.length ? (
        filtered.map((document) => <DocumentRow key={document.id} document={document} />)
      ) : (
        <p className="border-t border-ink/10 py-7 text-sm text-muted">
          Ничего не подходит под выбранный фильтр.
        </p>
      )}
    </div>
  );
}
