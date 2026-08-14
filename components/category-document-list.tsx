"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { DocumentRow } from "@/components/document-row";
import { LANGUAGES, languageLabel } from "@/lib/languages";
import type { AuthorRow, DocumentRow as DocumentRowType, TagRow } from "@/lib/db/queries";

type Doc = DocumentRowType & {
  authors: AuthorRow[];
  subjects?: AuthorRow[];
  tags?: TagRow[];
};

type AuthorGroup = {
  id: string;
  name: string;
  byDocs: Doc[];
  aboutDocs: Doc[];
};

type ExtraFilter = "author" | "tag" | "bilingual";

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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-[9.5rem] flex-1 flex-col gap-1">
      <span className="text-[11px] text-muted">{label}</span>
      {children}
    </label>
  );
}

export function CategoryDocumentList({ documents }: { documents: Doc[] }) {
  const [language, setLanguage] = useState("");
  const [sortBy, setSortBy] = useState<"title" | "year" | "language">("title");
  const [groupBy, setGroupBy] = useState<"none" | "author" | "language">("none");
  const [authorId, setAuthorId] = useState("");
  const [tagId, setTagId] = useState("");
  const [bilingualOnly, setBilingualOnly] = useState(false);
  const [extras, setExtras] = useState<ExtraFilter[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const addRef = useRef<HTMLDivElement>(null);

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

  const tagOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const doc of documents) {
      for (const tag of doc.tags ?? []) byId.set(tag.id, tag.name);
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [documents]);

  useEffect(() => {
    if (!addOpen) return;
    function onDoc(event: MouseEvent) {
      if (!addRef.current?.contains(event.target as Node)) setAddOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [addOpen]);

  function addExtra(kind: ExtraFilter) {
    setExtras((prev) => (prev.includes(kind) ? prev : [...prev, kind]));
    setAddOpen(false);
  }

  function removeExtra(kind: ExtraFilter) {
    setExtras((prev) => prev.filter((item) => item !== kind));
    if (kind === "author") setAuthorId("");
    if (kind === "tag") setTagId("");
    if (kind === "bilingual") setBilingualOnly(false);
  }

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
        if (tagId && !(d.tags ?? []).some((t) => t.id === tagId)) return false;
        return true;
      }),
    [documents, language, bilingualOnly, authorId, tagId],
  );

  const groupByAuthor = groupBy === "author";
  const groupByLanguage = groupBy === "language";

  const groups = useMemo<{ named: AuthorGroup[]; unattributed: Doc[] }>(() => {
    if (!groupByAuthor) return { named: [], unattributed: [] };
    const byId = new Map<string, AuthorGroup>();
    const unattributed: Doc[] = [];
    for (const doc of filtered) {
      if (doc.authors.length === 0 && (doc.subjects ?? []).length === 0) {
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
    return {
      named: [...byId.values()]
        .map((g) => ({ ...g, byDocs: sortDocs(g.byDocs, sortBy), aboutDocs: sortDocs(g.aboutDocs, sortBy) }))
        .sort((a, b) => a.name.localeCompare(b.name, "ru")),
      unattributed: sortDocs(unattributed, sortBy),
    };
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
    const inner = sortBy === "language" ? "title" : sortBy;
    return [...byCode.entries()]
      .map(([code, docs]) => ({
        code,
        label: code ? languageLabel(code) : "Язык не указан",
        docs: sortDocs(docs, inner),
      }))
      .sort((a, b) => (!a.code ? 1 : !b.code ? -1 : a.label.localeCompare(b.label, "ru")));
  }, [filtered, groupByLanguage, sortBy]);

  const showBar =
    usedLanguages.length > 1 || hasYears || authorOptions.length > 1 || tagOptions.length > 0 || hasBilingual;

  const availableExtras: { kind: ExtraFilter; label: string; ok: boolean }[] = [
    { kind: "author", label: "Автор / тема", ok: authorOptions.length > 1 && !extras.includes("author") },
    { kind: "tag", label: "Метка", ok: tagOptions.length > 0 && !extras.includes("tag") },
    { kind: "bilingual", label: "Только билингва", ok: hasBilingual && !extras.includes("bilingual") },
  ];

  if (!showBar) {
    return (
      <div>
        {documents.map((document) => (
          <DocumentRow key={document.id} document={document} />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 border border-ink/12 bg-ink/[0.02] p-3 md:p-4" style={{ borderRadius: 8 }}>
        <div className="flex flex-wrap items-end gap-3">
          {usedLanguages.length > 1 && (
            <Field label="Язык">
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="filter-control w-full min-w-[10rem] rounded-md px-3 py-2 text-sm"
              >
                <option value="">Все</option>
                {usedLanguages.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {languageLabel(lang.code)}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Сортировка">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="filter-control w-full min-w-[10rem] rounded-md px-3 py-2 text-sm"
            >
              <option value="title">По алфавиту</option>
              {hasYears && <option value="year">По году</option>}
              {usedLanguages.length > 1 && <option value="language">По языку</option>}
            </select>
          </Field>
          {(authorOptions.length >= 2 || usedLanguages.length > 1) && (
            <Field label="Группировка">
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}
                className="filter-control w-full min-w-[10rem] rounded-md px-3 py-2 text-sm"
              >
                <option value="none">Нет</option>
                {authorOptions.length >= 2 && <option value="author">По автору</option>}
                {usedLanguages.length > 1 && <option value="language">По языку</option>}
              </select>
            </Field>
          )}

          {extras.includes("author") && (
            <Field label="Автор / тема">
              <div className="flex items-center gap-1">
                <select
                  value={authorId}
                  onChange={(e) => setAuthorId(e.target.value)}
                  className="filter-control w-full min-w-[10rem] rounded-md px-3 py-2 text-sm"
                >
                  <option value="">Все</option>
                  {authorOptions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <button type="button" className="icon-button !size-9" aria-label="Убрать" onClick={() => removeExtra("author")}>
                  <X size={13} />
                </button>
              </div>
            </Field>
          )}

          {extras.includes("tag") && (
            <Field label="Метка">
              <div className="flex items-center gap-1">
                <select
                  value={tagId}
                  onChange={(e) => setTagId(e.target.value)}
                  className="filter-control w-full min-w-[10rem] rounded-md px-3 py-2 text-sm"
                >
                  <option value="">Все</option>
                  {tagOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <button type="button" className="icon-button !size-9" aria-label="Убрать" onClick={() => removeExtra("tag")}>
                  <X size={13} />
                </button>
              </div>
            </Field>
          )}

          {extras.includes("bilingual") && (
            <div className="flex items-end gap-1 pb-0.5">
              <label className="flex items-center gap-2 rounded-md border border-ink/15 bg-paper px-3 py-2 text-sm">
                <input type="checkbox" checked={bilingualOnly} onChange={(e) => setBilingualOnly(e.target.checked)} />
                только билингва
              </label>
              <button type="button" className="icon-button !size-9" aria-label="Убрать" onClick={() => removeExtra("bilingual")}>
                <X size={13} />
              </button>
            </div>
          )}

          {availableExtras.some((e) => e.ok) && (
            <div className="relative" ref={addRef}>
              <button
                type="button"
                onClick={() => setAddOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-ink/25 px-3 py-2 text-sm text-muted hover:border-ink/40 hover:text-ink"
              >
                <Plus size={14} />
                Фильтр
              </button>
              {addOpen && (
                <div className="absolute left-0 top-full z-30 mt-1 min-w-[11rem] rounded-md border border-ink/15 bg-paper py-1 shadow-lg">
                  {availableExtras
                    .filter((e) => e.ok)
                    .map((e) => (
                      <button
                        key={e.kind}
                        type="button"
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-ink/[0.05]"
                        onClick={() => addExtra(e.kind)}
                      >
                        {e.label}
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}

          <span className="ml-auto self-end pb-2 font-mono text-[10px] text-muted">
            {filtered.length}/{documents.length}
          </span>
        </div>
      </div>

      {filtered.length === 0 && (
        <p className="border-t border-ink/10 py-7 text-sm text-muted">Ничего не подходит под фильтр.</p>
      )}

      {filtered.length > 0 && !groupByAuthor && !groupByLanguage &&
        flatSorted.map((document) => <DocumentRow key={document.id} document={document} />)}

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

      {filtered.length > 0 && groupByAuthor && (
        <div className="space-y-8">
          {groups.named.map((group) => (
            <div key={group.id}>
              <p className="mb-1 font-serif text-lg tracking-tight">{group.name}</p>
              {group.byDocs.map((document) => (
                <DocumentRow key={`${group.id}-by-${document.id}`} document={document} />
              ))}
              {group.aboutDocs.length > 0 && (
                <div className="mt-3">
                  <p className="mb-1 text-[11px] text-muted">О нём/о ней</p>
                  {group.aboutDocs.map((document) => (
                    <DocumentRow key={`${group.id}-about-${document.id}`} document={document} />
                  ))}
                </div>
              )}
            </div>
          ))}
          {groups.unattributed.map((document) => (
            <DocumentRow key={document.id} document={document} />
          ))}
        </div>
      )}
    </div>
  );
}
