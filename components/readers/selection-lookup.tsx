"use client";

import Link from "next/link";
import { RefObject, useEffect, useState } from "react";
import { BookMarked, BookOpenText, ExternalLink, Languages, Plus } from "lucide-react";
import type { LookupResult } from "@/lib/lookup";
import type { GlossaryHit } from "@/lib/db/glossaries";

type LookupPayload = LookupResult & { glossaryHits?: GlossaryHit[] };

/**
 * In-page lookup panel: morphology, definitions, translation, and matches
 * from community / personal glossaries — without leaving the reader.
 */
export function SelectionLookup({
  containerRef,
  suppressed = false,
  doc,
  language,
}: {
  containerRef: RefObject<HTMLElement | null>;
  suppressed?: boolean;
  doc?: Document | null;
  language?: string | null;
}) {
  const [state, setState] = useState<{ text: string; top: number; left: number } | null>(null);
  const [lookup, setLookup] = useState<LookupPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [myGlossaries, setMyGlossaries] = useState<{ id: string; title: string }[]>([]);
  const [pickOpen, setPickOpen] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [editTerm, setEditTerm] = useState("");
  const [editDefinition, setEditDefinition] = useState("");
  const [newTitle, setNewTitle] = useState("");

  useEffect(() => {
    const targetDoc = doc ?? document;
    if (suppressed) {
      setState(null);
      setLookup(null);
      setPickOpen(false);
      return;
    }

    function handle() {
      const container = containerRef.current;
      const targetWindow = targetDoc.defaultView;
      const selection = targetWindow?.getSelection();
      if (!container || !selection || selection.isCollapsed || selection.rangeCount === 0) {
        setState(null);
        return;
      }
      const range = selection.getRangeAt(0);
      const isIframeDoc = doc && doc !== document;
      if (!isIframeDoc && !container.contains(range.commonAncestorContainer)) {
        setState(null);
        return;
      }
      const text = selection.toString().trim();
      if (!text || text.length > 300) {
        setState(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      if (!rect.width && !rect.height) {
        setState(null);
        return;
      }
      const frameElement = isIframeDoc ? targetWindow?.frameElement : null;
      const frameOffset = frameElement?.getBoundingClientRect() ?? { top: 0, left: 0 };
      const containerRect = container.getBoundingClientRect();
      setState({
        text,
        top: frameOffset.top + rect.top - containerRect.top,
        left: frameOffset.left + rect.left - containerRect.left + rect.width / 2,
      });
    }

    targetDoc.addEventListener("selectionchange", handle);
    return () => targetDoc.removeEventListener("selectionchange", handle);
  }, [containerRef, suppressed, doc]);

  useEffect(() => {
    if (!state?.text) {
      setLookup(null);
      setPickOpen(false);
      setSaveMsg(null);
      setEditTerm("");
      setEditDefinition("");
      return;
    }
    setEditTerm(state.text);
    const wordish = state.text.trim().split(/\s+/).length <= 8;
    if (!wordish) {
      setLookup(null);
      setEditDefinition("");
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: state.text });
        if (language) params.set("lang", language);
        const res = await fetch(`/api/lookup?${params}`);
        if (!res.ok) throw new Error("lookup failed");
        const data = (await res.json()) as LookupPayload;
        if (!cancelled) {
          setLookup(data);
          setEditTerm(data.lemma ?? state.text);
          // Prefer a real definition / morph summary — never auto-fill with
          // machine translation (especially RU→EN), which was polluting glossaries.
          setEditDefinition(
            data.definitions[0] ?? data.parses[0]?.summary ?? "",
          );
        }
      } catch {
        if (!cancelled) setLookup(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [state?.text, language]);

  async function openAddPicker() {
    setPickOpen(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/glossaries");
      if (!res.ok) {
        setSaveMsg("Войдите, чтобы сохранять в свой словарь.");
        return;
      }
      const data = (await res.json()) as {
        glossaries: { id: string; title: string; mine?: boolean }[];
      };
      setMyGlossaries(
        data.glossaries.filter((g) => g.mine).map((g) => ({ id: g.id, title: g.title })),
      );
    } catch {
      setSaveMsg("Не удалось загрузить словари.");
    }
  }

  async function createGlossaryAndSave() {
    const title = newTitle.trim();
    if (!title) {
      setSaveMsg("Введите название словаря.");
      return;
    }
    setAdding(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/glossaries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          visibility: "private",
          language: language || null,
        }),
      });
      if (res.status === 401) {
        setSaveMsg("Войдите, чтобы создавать словари.");
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        setSaveMsg(data.error || "Не удалось создать словарь.");
        return;
      }
      setMyGlossaries((prev) => [{ id: data.id!, title }, ...prev]);
      setNewTitle("");
      await saveToGlossary(data.id);
    } finally {
      setAdding(false);
    }
  }

  async function saveToGlossary(glossaryId: string) {
    if (!state?.text) return;
    setAdding(true);
    setSaveMsg(null);
    try {
      const term = editTerm.trim() || state.text;
      const definition =
        editDefinition.trim() ||
        lookup?.definitions[0] ||
        lookup?.parses[0]?.summary ||
        "—";
      const res = await fetch(`/api/glossaries/${glossaryId}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          term,
          definition,
          aliases: state.text !== term ? state.text : undefined,
          notes: lookup?.parses[0]?.summary ?? undefined,
        }),
      });
      if (res.status === 401) {
        setSaveMsg("Войдите, чтобы сохранять.");
        return;
      }
      if (res.status === 403) {
        setSaveMsg("Это чужой словарь — создайте свой ниже.");
        return;
      }
      if (!res.ok) {
        setSaveMsg("Не удалось сохранить.");
        return;
      }
      setSaveMsg("Сохранено в словарь.");
      setPickOpen(false);
    } finally {
      setAdding(false);
    }
  }

  if (!state) return null;

  const lemma = lookup?.lemma;
  const parseLine = lookup?.parses[0]?.summary;
  const hits = lookup?.glossaryHits ?? [];

  return (
    <div
      className="sticker-panel absolute z-30 w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-full rounded-2xl border border-ink/10 bg-white p-3 shadow-lg"
      style={{ top: Math.max(0, state.top - 10), left: state.left }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <p className="mb-1.5 truncate font-mono text-[10px] uppercase tracking-widest text-muted">
        {state.text}
      </p>

      {loading && !lookup && <p className="mb-2 text-xs text-muted">разбор…</p>}

      {lookup && (
        <div className="mb-2 space-y-1.5 text-sm leading-snug">
          {(lemma || parseLine) && (
            <p>
              {lemma && lemma !== state.text.trim() && (
                <span className="font-medium text-ink">→ {lemma}</span>
              )}
              {parseLine && (
                <span className="text-muted">
                  {lemma && lemma !== state.text.trim() ? " · " : ""}
                  {parseLine}
                </span>
              )}
            </p>
          )}
          {lookup.translation && (
            <p className="rounded-lg bg-ink/[0.04] px-2 py-1.5 text-[13px]">
              <Languages size={12} className="mr-1 inline opacity-60" />
              {lookup.translation}
            </p>
          )}
          {lookup.definitions.slice(0, 2).map((d, i) => (
            <p key={i} className="text-[13px] text-ink/90">
              {d}
            </p>
          ))}
          {hits.length > 0 && (
            <div className="space-y-1 border-t border-ink/10 pt-1.5">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
                Наши словари
              </p>
              {hits.map((h) => (
                <div key={h.entryId} className="rounded-lg bg-rust/[0.06] px-2 py-1.5 text-[13px]">
                  <Link
                    href={`/glossaries/${h.glossaryId}`}
                    className="font-medium text-rust hover:underline"
                  >
                    {h.term}
                  </Link>
                  <span className="text-muted"> · {h.glossaryTitle}</span>
                  <p className="mt-0.5 text-ink/90">{h.definition}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={openAddPicker}
          className="inline-flex items-center gap-1 rounded-full border border-ink/15 px-2.5 py-1 text-[11px] font-medium text-ink hover:border-rust hover:text-rust"
          title="Сохранить в свой словарь"
        >
          <Plus size={12} />
          В словарь
        </button>
        <Link
          href="/glossaries"
          className="icon-button size-8"
          title="Все словари"
          aria-label="Словари"
        >
          <BookMarked size={13} />
        </Link>
        {lookup && (
          <a
            href={`https://${lookup.wiktionaryHost}/wiki/${encodeURIComponent(lookup.wiktionaryTitle)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="icon-button size-8"
            title="Wiktionary (лемма)"
          >
            <BookOpenText size={13} />
          </a>
        )}
        {lookup?.logeionUrl && (
          <a
            href={lookup.logeionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="icon-button size-8"
            title="Logeion"
          >
            <ExternalLink size={13} />
          </a>
        )}
      </div>

      {pickOpen && (
        <div className="mt-2 space-y-2 border-t border-ink/10 pt-2">
          <p className="text-[11px] font-medium text-ink">Сохранить в словарь</p>
          <label className="block text-[11px] text-muted">
            Слово / термин
            <input
              value={editTerm}
              onChange={(e) => setEditTerm(e.target.value)}
              className="mt-0.5 w-full rounded-lg border border-ink/15 px-2 py-1.5 text-xs text-ink outline-none focus:border-ink/40"
            />
          </label>
          <label className="block text-[11px] text-muted">
            Определение
            <textarea
              value={editDefinition}
              onChange={(e) => setEditDefinition(e.target.value)}
              rows={2}
              placeholder="Краткое значение…"
              className="mt-0.5 w-full rounded-lg border border-ink/15 px-2 py-1.5 text-xs text-ink outline-none focus:border-ink/40"
            />
          </label>
          <p className="text-[11px] text-muted">Куда:</p>
          {myGlossaries.length === 0 ? (
            <p className="text-[11px] text-muted">Своих словарей пока нет — создайте ниже.</p>
          ) : (
            <div className="max-h-36 space-y-0.5 overflow-y-auto">
              {myGlossaries.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  disabled={adding}
                  onClick={() => saveToGlossary(g.id)}
                  className="block w-full rounded-lg px-2 py-1.5 text-left text-xs text-ink hover:bg-ink/[0.05]"
                >
                  {g.title}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-1.5 border-t border-ink/8 pt-2">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Новый словарь…"
              className="min-w-0 flex-1 rounded-lg border border-ink/15 px-2 py-1.5 text-xs outline-none focus:border-ink/40"
            />
            <button
              type="button"
              disabled={adding}
              onClick={createGlossaryAndSave}
              className="shrink-0 rounded-lg bg-ink px-2.5 py-1.5 text-[11px] font-medium text-paper"
            >
              Создать
            </button>
          </div>
        </div>
      )}
      {saveMsg && <p className="mt-1.5 text-[11px] text-muted">{saveMsg}</p>}
    </div>
  );
}
