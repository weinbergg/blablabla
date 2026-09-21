"use client";

import Link from "next/link";
import { RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { BookMarked, BookOpenText, ExternalLink, Languages, Plus, X } from "lucide-react";
import { ShareWithFriends } from "@/components/share-with-friends";
import type { LookupResult } from "@/lib/lookup";
import type { GlossaryHit } from "@/lib/db/glossaries";

type LookupPayload = LookupResult & { glossaryHits?: GlossaryHit[] };
type LookupPanelPos = { top: number; left: number };
const LOOKUP_SELECTION_LIMIT = 480;

function normalizeSelectedText(text: string) {
  return text
    .replace(/\u00ad/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function selectionTokenCount(text: string) {
  const normalized = normalizeSelectedText(text);
  return normalized ? normalized.split(/\s+/).length : 0;
}

function cleanLookupTranslation(text: string | null | undefined) {
  if (!text) return "";
  return text.replace(/^\s*[→⇢⇒]+\s*/u, "").replace(/\s+/g, " ").trim();
}

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
  const [panelPos, setPanelPos] = useState<LookupPanelPos | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const selectionTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const targetDoc = doc ?? document;
    if (suppressed) {
      setState(null);
      setLookup(null);
      setPickOpen(false);
      return;
    }

    function clearSelection() {
      setState(null);
    }

    function syncSelection() {
      const container = containerRef.current;
      const targetWindow = targetDoc.defaultView;
      const selection = targetWindow?.getSelection();
      if (!container || !selection || selection.isCollapsed || selection.rangeCount === 0) {
        clearSelection();
        return;
      }
      const range = selection.getRangeAt(0);
      const isIframeDoc = doc && doc !== document;
      if (!isIframeDoc && !container.contains(range.commonAncestorContainer)) {
        clearSelection();
        return;
      }
      const text = normalizeSelectedText(selection.toString());
      if (!text || text.length > LOOKUP_SELECTION_LIMIT) {
        clearSelection();
        return;
      }
      const rect = range.getBoundingClientRect();
      if (!rect.width && !rect.height) {
        clearSelection();
        return;
      }
      const frameElement = isIframeDoc ? targetWindow?.frameElement : null;
      const frameOffset = frameElement?.getBoundingClientRect() ?? { top: 0, left: 0 };
      const containerRect = container.getBoundingClientRect();
      const nextState = {
        text,
        top: frameOffset.top + rect.top - containerRect.top,
        left: frameOffset.left + rect.left - containerRect.left + rect.width / 2,
      };
      setState((current) => {
        if (
          current &&
          current.text === nextState.text &&
          Math.abs(current.top - nextState.top) < 2 &&
          Math.abs(current.left - nextState.left) < 2
        ) {
          return current;
        }
        return nextState;
      });
    }

    function handle() {
      if (selectionTimerRef.current) window.clearTimeout(selectionTimerRef.current);
      selectionTimerRef.current = window.setTimeout(syncSelection, 90);
    }

    targetDoc.addEventListener("selectionchange", handle);
    return () => {
      if (selectionTimerRef.current) window.clearTimeout(selectionTimerRef.current);
      targetDoc.removeEventListener("selectionchange", handle);
    };
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
    const wordish = selectionTokenCount(state.text) <= 8;
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

  useLayoutEffect(() => {
    if (!state || !containerRef.current || !panelRef.current) {
      setPanelPos(null);
      return;
    }
    const panel = panelRef.current;
    const container = containerRef.current;
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const gap = 12;
    const left = Math.max(
      8,
      Math.min(state.left - width / 2, container.clientWidth - width - 8),
    );
    const openBelow = state.top < height + 40;
    const top = openBelow
      ? Math.min(state.top + 18, Math.max(8, container.clientHeight - height - 8))
      : Math.max(8, state.top - height - gap);
    setPanelPos({ top, left });
  }, [containerRef, lookup, myGlossaries.length, pickOpen, saveMsg, state]);

  function closeLookup() {
    (doc ?? document).defaultView?.getSelection()?.removeAllRanges();
    setState(null);
    setLookup(null);
    setPickOpen(false);
  }

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
  const translation = cleanLookupTranslation(lookup?.translation ?? "");
  const hits = lookup?.glossaryHits ?? [];
  const normalizedStateText = normalizeSelectedText(state.text);
  const tokenCount = selectionTokenCount(state.text);
  const normalizedLemma = lemma ? normalizeSelectedText(lemma) : "";
  const showLemma =
    Boolean(normalizedLemma) &&
    tokenCount === 1 &&
    normalizedLemma.toLowerCase() !== normalizedStateText.toLowerCase();
  const showParseLine = Boolean(parseLine) && tokenCount <= 4;
  const actionButtonClass =
    "inline-flex min-h-10 items-center gap-2 rounded-full border border-ink/15 px-3 text-[12px] font-medium text-ink transition-colors hover:border-rust hover:text-rust";
  const iconActionClass =
    "inline-grid size-10 place-items-center rounded-full border border-ink/15 text-muted transition-colors hover:border-rust hover:text-rust";

  return (
    <div
      ref={panelRef}
      className="sticker-panel absolute z-30 w-[min(24rem,calc(100vw-1rem))] max-h-[min(30rem,calc(100vh-1rem))] overflow-y-auto rounded-2xl border border-ink/10 bg-white p-3 shadow-lg"
      style={{
        top: panelPos?.top ?? Math.max(8, state.top - 12),
        left: panelPos?.left ?? Math.max(8, state.left - 160),
      }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className="mb-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted">Выделение</p>
          <p className="mt-1 line-clamp-3 text-[15px] font-medium leading-6 text-ink">{state.text}</p>
        </div>
        <button
          type="button"
          onClick={closeLookup}
          className="icon-button !size-8 shrink-0"
          aria-label="Скрыть меню выделения"
          title="Скрыть"
        >
          <X size={13} />
        </button>
      </div>

      {loading && !lookup && <p className="mb-2 text-xs text-muted">разбор…</p>}

      {lookup && (
        <div className="mb-2 space-y-1.5 text-sm leading-snug">
          {showLemma && (
            <p className="rounded-lg bg-ink/[0.04] px-2 py-1.5 text-[13px]">
              <span className="mr-1 text-muted">Лемма:</span>
              <span className="font-medium text-ink">{normalizedLemma}</span>
            </p>
          )}
          {showParseLine && <p className="text-[12px] text-muted">{parseLine}</p>}
          {translation && translation.toLowerCase() !== normalizedStateText.toLowerCase() && (
            <p className="rounded-lg bg-ink/[0.04] px-2 py-1.5 text-[13px]">
              <Languages size={12} className="mr-1 inline opacity-60" />
              <span className="mr-1 text-muted">Перевод:</span>
              {translation}
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

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={openAddPicker}
          className={actionButtonClass}
          title="Сохранить в свой словарь"
        >
          <Plus size={12} />
          В словарь
        </button>
        <ShareWithFriends
          compact
          buttonLabel="Поделиться"
          buttonClassName="!min-h-10 !gap-2 !px-3 !text-[12px]"
          payload={{
            kind: "quote",
            title: "Цитата",
            url:
              typeof window !== "undefined"
                ? `${window.location.pathname}${window.location.search}`
                : "/",
            excerpt: state.text,
          }}
        />
        <Link
          href="/glossaries"
          className={iconActionClass}
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
            className={iconActionClass}
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
            className={iconActionClass}
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
