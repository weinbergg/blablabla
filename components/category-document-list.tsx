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

function sortDocs(docs: Doc[], sortBy: "title" | "year" | "language") {
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
  } else if (sortBy === "language") {
    sorted.sort((a, b) => {
      const al = a.language ? languageLabel(a.language) : "";
      const bl = b.language ? languageLabel(b.language) : "";
      if (!al && !bl) return a.title.localeCompare(b.title, "ru");
      if (!al) return 1;
      if (!bl) return -1;
      const cmp = al.localeCompare(bl, "ru");
      if (cmp !== 0) return cmp;
      return a.title.localeCompare(b.title, "ru");
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
  const [sortBy, setSortBy] = useState<"title" | "year" | "language">("title");

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
  const [groupByLanguage, setGroupByLanguage] = useState(false);

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

  const languageGroups = useMemo(() => {
    if (!groupByLanguage) return [];
    const byCode = new Map<string, Doc[]>();
    for (const doc of filtered) {
      const code = doc.language || "";
      const list = byCode.get(code) ?? [];
      list.push(doc);
      byCode.set(code, list);
    }
    const innerSort = sortBy === "language" ? "title" : sortBy;
    return [...byCode.entries()]
      .map(([code, docs]) => ({
        code,
        label: code ? languageLabel(code) : "Язык не указан",
        docs: sortDocs(docs, innerSort),
      }))
      .sort((a, b) => {
        if (!a.code) return 1;
        if (!b.code) return -1;
        return a.label.localeCompare(b.label, "ru");
      });
  }, [filtered, groupByLanguage, sortBy]);

  const filtersActive = Boolean(language || bilingualOnly || authorId);
  const showFilters =
    usedLanguages.length > 1 || hasBilingual || authorOptions.length > 1 || hasYears || authorOptions.length >= 2;

  return (
    <div>
      {showFilters && (
        <div className="mb-4 space-y-2">
          {usedLanguages.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Язык">
              <button
                type="button"
                onClick={() => setLanguage("")}
                className={`filter-chip ${language === "" ? "filter-chip-active" : ""}`}
              >
                Все языки
              </button>
              {usedLanguages.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => setLanguage(lang.code)}
                  className={`filter-chip ${language === lang.code ? "filter-chip-active" : ""}`}
                >
                  {languageLabel(lang.code)}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
          {hasBilingual && (
            <label className="filter-chip flex items-center gap-1.5">
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
              className="filter-control max-w-[14rem] truncate rounded-full px-3 py-1.5 text-xs"
            >
              <option value="">Все авторы и темы</option>
              {authorOptions.map((author) => (
                <option key={author.id} value={author.id}>
                  {author.name}
                </option>
              ))}
            </select>
          )}
          {(hasYears || usedLanguages.length > 1) && (
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as "title" | "year" | "language")}
              className="filter-control rounded-full px-3 py-1.5 text-xs"
            >
              <option value="title">по алфавиту</option>
              {hasYears && <option value="year">по году</option>}
              {usedLanguages.length > 1 && <option value="language">по языку</option>}
            </select>
          )}
          {authorOptions.length >= 2 && (
            <label className="filter-chip flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={groupByAuthor && !groupByLanguage}
                onChange={(event) => {
                  setGroupByAuthor(event.target.checked);
                  if (event.target.checked) setGroupByLanguage(false);
                }}
              />
              группировать по автору
            </label>
          )}
          {usedLanguages.length > 1 && (
            <label className="filter-chip flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={groupByLanguage}
                onChange={(event) => {
                  setGroupByLanguage(event.target.checked);
                  if (event.target.checked) setGroupByAuthor(false);
                }}
              />
              группировать по языку
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
        </div>
      )}

      {filtered.length === 0 && (
        <p className="border-t border-ink/10 py-7 text-sm text-muted">
          Ничего не подходит под выбранный фильтр.
        </p>
      )}

      {filtered.length > 0 && !groupByAuthor && !groupByLanguage && flatSorted.map((document) => <DocumentRow key={document.id} document={document} />)}

      {filtered.length > 0 && groupByLanguage && (
        <div className="space-y-8">
          {languageGroups.map((group) => (
            <div key={group.code || "unknown"}>
              <p className="mb-1 font-serif text-lg tracking-tight">{group.label}</p>
              {group.docs.map((document) => (
                <DocumentRow key={document.id} document={document} />
              ))}
            </div>
          ))}
        </div>
      )}

      {filtered.length > 0 && groupByAuthor && !groupByLanguage && (
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
