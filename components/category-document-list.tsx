"use client";

import { useMemo, useState } from "react";
import { DocumentRow } from "@/components/document-row";
import { LANGUAGES, languageLabel } from "@/lib/languages";
import type { AuthorRow, DocumentRow as DocumentRowType } from "@/lib/db/queries";

type Doc = DocumentRowType & { authors: AuthorRow[]; subjects?: AuthorRow[] };

type AuthorGroup = {
  id: string;
  name: string;
  byDocs: Doc[];
  aboutDocs: Doc[];
};

function sortDocs(docs: Doc[], sortBy: "title" | "year") {
  const sorted = [...docs];
  if (sortBy === "year") {
    sorted.sort((a, b) => {
      const ay = a.year ? Number.parseInt(a.year, 10) : null;
      const by = b.year ? Number.parseInt(b.year, 10) : null;
      if (ay === null && by === null) return a.title.localeCompare(b.title, "ru");
      if (ay === null) return 1;
      if (by === null) return -1;
      return ay - by;
    });
  } else {
    sorted.sort((a, b) => a.title.localeCompare(b.title, "ru"));
  }
  return sorted;
}

/** Client-side filters/grouping for a category's document list — the
 * catalog is small enough per category that doing this in the browser
 * (rather than a server round-trip) keeps it snappy. */
export function CategoryDocumentList({ documents }: { documents: Doc[] }) {
  const [language, setLanguage] = useState("");
  const [bilingualOnly, setBilingualOnly] = useState(false);
  const [authorId, setAuthorId] = useState("");
  const [sortBy, setSortBy] = useState<"title" | "year">("title");

  const usedLanguages = useMemo(
    () => LANGUAGES.filter((l) => documents.some((d) => d.language === l.code)),
    [documents],
  );
  const hasBilingual = useMemo(() => documents.some((d) => d.secondaryLanguage), [documents]);
  const hasYears = useMemo(() => documents.some((d) => d.year), [documents]);

  const authorOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const doc of documents) {
      for (const author of doc.authors) byId.set(author.id, author.name);
      for (const subject of doc.subjects ?? []) byId.set(subject.id, subject.name);
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [documents]);

  const [groupByAuthor, setGroupByAuthor] = useState(() => authorOptions.length >= 3);

  const filtered = useMemo(
    () =>
      documents.filter((d) => {
        if (language && d.language !== language) return false;
        if (bilingualOnly && !d.secondaryLanguage) return false;
        if (authorId) {
          const matches =
            d.authors.some((a) => a.id === authorId) || (d.subjects ?? []).some((a) => a.id === authorId);
          if (!matches) return false;
        }
        return true;
      }),
    [documents, language, bilingualOnly, authorId],
  );

  const groups = useMemo<{ named: AuthorGroup[]; unattributed: Doc[] }>(() => {
    if (!groupByAuthor) return { named: [], unattributed: [] };
    const byId = new Map<string, AuthorGroup>();
    const unattributed: Doc[] = [];
    for (const doc of filtered) {
      const authorIds = doc.authors.map((a) => a.id);
      const subjectIds = (doc.subjects ?? []).map((a) => a.id);
      if (authorIds.length === 0 && subjectIds.length === 0) {
        unattributed.push(doc);
        continue;
      }
      for (const author of doc.authors) {
        const group = byId.get(author.id) ?? { id: author.id, name: author.name, byDocs: [], aboutDocs: [] };
        group.byDocs.push(doc);
        byId.set(author.id, group);
      }
      for (const subject of doc.subjects ?? []) {
        const group = byId.get(subject.id) ?? { id: subject.id, name: subject.name, byDocs: [], aboutDocs: [] };
        group.aboutDocs.push(doc);
        byId.set(subject.id, group);
      }
    }
    const named = [...byId.values()]
      .map((group) => ({ ...group, byDocs: sortDocs(group.byDocs, sortBy), aboutDocs: sortDocs(group.aboutDocs, sortBy) }))
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
    return { named, unattributed: sortDocs(unattributed, sortBy) };
  }, [filtered, groupByAuthor, sortBy]);

  const flatSorted = useMemo(() => sortDocs(filtered, sortBy), [filtered, sortBy]);

  const filtersActive = Boolean(language || bilingualOnly || authorId);
  const showFilters =
    usedLanguages.length > 1 || hasBilingual || authorOptions.length > 1 || hasYears || authorOptions.length >= 2;

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
          {authorOptions.length > 1 && (
            <select
              value={authorId}
              onChange={(event) => setAuthorId(event.target.value)}
              className="max-w-[14rem] truncate rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs dark:bg-white/5"
            >
              <option value="">Все авторы и темы</option>
              {authorOptions.map((author) => (
                <option key={author.id} value={author.id}>
                  {author.name}
                </option>
              ))}
            </select>
          )}
          {hasYears && (
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as "title" | "year")}
              className="rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs dark:bg-white/5"
            >
              <option value="title">по алфавиту</option>
              <option value="year">по году</option>
            </select>
          )}
          {authorOptions.length >= 2 && (
            <label className="flex items-center gap-1.5 rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs dark:bg-white/5">
              <input
                type="checkbox"
                checked={groupByAuthor}
                onChange={(event) => setGroupByAuthor(event.target.checked)}
              />
              группировать по автору
            </label>
          )}
          {filtersActive && (
            <button
              type="button"
              onClick={() => {
                setLanguage("");
                setBilingualOnly(false);
                setAuthorId("");
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

      {filtered.length === 0 && (
        <p className="border-t border-ink/10 py-7 text-sm text-muted">
          Ничего не подходит под выбранный фильтр.
        </p>
      )}

      {filtered.length > 0 && !groupByAuthor && flatSorted.map((document) => <DocumentRow key={document.id} document={document} />)}

      {filtered.length > 0 && groupByAuthor && (
        <div className="space-y-8">
          {groups.named.map((group) => (
            <div key={group.id}>
              <p className="mb-1 font-serif text-lg tracking-tight">{group.name}</p>
              {group.byDocs.length > 0 && (
                <div className="mt-2">
                  {group.aboutDocs.length > 0 && (
                    <p className="eyebrow mb-1 text-[10px]">Тексты автора</p>
                  )}
                  {group.byDocs.map((document) => (
                    <DocumentRow key={document.id} document={document} />
                  ))}
                </div>
              )}
              {group.aboutDocs.length > 0 && (
                <div className="mt-3">
                  <p className="eyebrow mb-1 text-[10px]">О нём/о ней</p>
                  {group.aboutDocs.map((document) => (
                    <DocumentRow key={document.id} document={document} />
                  ))}
                </div>
              )}
            </div>
          ))}
          {groups.unattributed.length > 0 && (
            <div>
              {groups.named.length > 0 && <p className="mb-1 font-serif text-lg tracking-tight">Без указания автора</p>}
              {groups.unattributed.map((document) => (
                <DocumentRow key={document.id} document={document} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
