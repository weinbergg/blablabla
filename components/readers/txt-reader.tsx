/**
 * Plain-text reader. The file is still cut into stable "листы" so annotations
 * keep a page number, but the reader itself scrolls downward through them
 * instead of pretending each slice is a turned page.
 */
"use client";

import { commentRequest } from "@/lib/comment-request";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  List,
  Loader2,
  MapPin,
  Search,
} from "lucide-react";
import {
  AnnotationLayer,
  type AnnotationCommentItem,
  type AnnotationDraft,
  type AnnotationItem,
  type AnnotationUpdate,
} from "./annotation-layer";
import { PageJumpInput } from "./page-jump-input";
import { ReaderSearchPanel } from "./reader-search-panel";
import { ReaderToc } from "./reader-toc";
import { AnchorNavigator } from "./anchor-navigator";
import { SelectionLookup } from "./selection-lookup";
import { ZoomControls } from "./zoom-controls";
import { buildSearchExcerpt, normalizeSearchText } from "@/lib/reader-search";
import { addBookmark } from "@/lib/bookmarks";
import { readerPageDirection } from "@/lib/reader-keys";
import { decodeTxtBytes } from "@/lib/txt-encoding";
import { splitTxtPages, txtTableOfContents } from "@/lib/txt-structure";

const TXT_ZOOM_KEY = "reader:txt-zoom";

type TxtSearchResult = {
  id: string;
  label: string;
  hint?: string;
  excerpt?: string;
  page: number;
  active?: boolean;
};

export function TxtReader({
  url,
  language,
  fullscreen = false,
  page = 1,
  onPageChange,
  documentId,
  currentUserId,
  initialAnnotations = [],
  comments = [],
  onReplyToAnnotation,
  onReport,
  canAnnotate = false,
  onAnnotationsChange,
  companionTarget,
  onOpenLinkedCompanion,
  onMirrorAnnotationCreated,
  compact = false,
}: {
  url: string;
  language?: string | null;
  fullscreen?: boolean;
  page?: number;
  onPageChange?: (page: number, total: number) => void;
  documentId?: string;
  currentUserId?: string | null;
  initialAnnotations?: AnnotationItem[];
  comments?: AnnotationCommentItem[];
  onReplyToAnnotation?: (annotationId: string, body: string) => Promise<void> | void;
  onReport?: (targetType: "annotation" | "comment", targetId: string) => void;
  canAnnotate?: boolean;
  onAnnotationsChange?: (items: AnnotationItem[]) => void;
  companionTarget?: {
    documentId: string;
    page: number | null;
    pageLabel?: string | null;
    title?: string | null;
  } | null;
  onOpenLinkedCompanion?: (item: AnnotationItem) => void;
  onMirrorAnnotationCreated?: (item: AnnotationItem) => void;
  compact?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageFromParent = useRef<number | null>(null);
  const numPagesNotified = useRef(0);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [annotations, setAnnotations] = useState(initialAnnotations);
  const [placing, setPlacing] = useState(false);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [bookmarkFlash, setBookmarkFlash] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<TxtSearchResult[]>([]);

  useEffect(() => {
    setAnnotations(initialAnnotations);
  }, [initialAnnotations]);

  useEffect(() => {
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
  }, [url]);

  useEffect(() => {
    onAnnotationsChange?.(annotations);
  }, [annotations, onAnnotationsChange]);

  useEffect(() => {
    const stored = Number.parseFloat(window.localStorage.getItem(TXT_ZOOM_KEY) ?? "");
    if (Number.isFinite(stored)) {
      setZoom(Math.min(1.6, Math.max(0.9, stored)));
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(TXT_ZOOM_KEY, String(zoom));
  }, [zoom]);

  useEffect(() => {
    let cancelled = false;
    pageFromParent.current = null;
    setText(null);
    setError(false);
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        const buf = await res.arrayBuffer();
        const decoded = decodeTxtBytes(buf);
        if (!cancelled) setText(decoded);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  const [tocOpen, setTocOpen] = useState(false);
  const pages = useMemo(() => (text == null ? [] : splitTxtPages(text)), [text]);
  const toc = useMemo(() => txtTableOfContents(pages), [pages]);
  const total = pages.length;
  const safePage = total > 0 ? Math.min(Math.max(1, page), total) : 1;
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;

  useEffect(() => {
    setSearchResults((current) =>
      current.map((item) => {
        const isActive = item.page === safePage;
        return item.active === isActive ? item : { ...item, active: isActive };
      }),
    );
  }, [safePage]);

  useEffect(() => {
    if (total <= 0) return;
    const cb = onPageChangeRef.current;
    if (!cb) return;
    if (page < 1 || page > total) {
      cb(Math.min(total, Math.max(1, page)), total);
    } else if (numPagesNotified.current !== total) {
      numPagesNotified.current = total;
      cb(safePage, total);
    }
  }, [total, page, safePage]);

  async function createAnnotation(draft: AnnotationDraft) {
    if (!documentId) return;
    const { id, mirror } = await commentRequest<{ id: string; mirror?: AnnotationItem }>("/api/annotations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId, ...draft }),
    });
    if (!id) throw new Error("Сервер не подтвердил сохранение пометки.");
    const createdAt = new Date().toISOString();
    setAnnotations((current) => [
      ...current,
      {
        id,
        authorId: currentUserId ?? "",
        authorName: "Вы",
        page: draft.page,
        x: draft.x,
        y: draft.y,
        shape: draft.shape,
        color: draft.color,
        body: draft.body,
        visibility: draft.visibility,
        allowDiscussion: draft.allowDiscussion,
        textAnchor: draft.textAnchor,
        anchorText: draft.anchorText,
        anchorRects: draft.anchorRects,
        companionDocumentId: draft.companionDocumentId ?? null,
        companionPage: draft.companionPage ?? null,
        companionTitle: draft.companionTitle ?? null,
        createdAt,
      },
    ]);
    if (mirror) onMirrorAnnotationCreated?.(mirror);
  }

  async function deleteAnnotation(id: string) {
    await commentRequest(`/api/annotations/${id}`, { method: "DELETE" });
    setAnnotations((current) => current.filter((item) => item.id !== id));
  }

  async function updateAnnotation(id: string, patch: AnnotationUpdate) {
    await commentRequest(`/api/annotations/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setAnnotations((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              ...patch,
              allowDiscussion:
                patch.allowDiscussion !== undefined
                  ? patch.allowDiscussion
                  : item.allowDiscussion,
            }
          : item,
      ),
    );
  }

  function scrollToSheet(target: number) {
    const node = scrollRef.current;
    const sheet = node?.querySelector(`[data-txt-page="${target}"]`);
    if (!node || !(sheet instanceof HTMLElement)) return;
    node.scrollTo({ top: sheet.offsetTop, behavior: "auto" });
  }

  function scrollByView(delta: -1 | 1) {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollBy({ top: delta * Math.round(node.clientHeight * 0.86), behavior: "smooth" });
  }

  function go(delta: -1 | 1) {
    scrollByView(delta);
  }

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      const direction = readerPageDirection(event);
      if (!direction) return;
      event.preventDefault();
      go(direction);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, safePage, onPageChange]);

  function jumpToPage(target: number) {
    if (!total || !onPageChange) return;
    const next = Math.min(total, Math.max(1, target));
    pageFromParent.current = next;
    onPageChange(next, total);
    scrollToSheet(next);
  }

  useEffect(() => {
    if (total <= 0) return;
    if (page === pageFromParent.current) return;
    pageFromParent.current = page;
    scrollToSheet(page);
  }, [page, total]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || total <= 0) return;
    const sheets = Array.from(node.querySelectorAll<HTMLElement>("[data-txt-page]"));
    let frame = 0;
    function update() {
      frame = 0;
      // A long sheet can never reach an intersection ratio of 0.35. Track
      // the reading line instead of jumping to a sheet just entering below.
      const line = node!.scrollTop + Math.min(120, node!.clientHeight * 0.2);
      let low = 0, high = sheets.length - 1;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (sheets[mid].offsetTop <= line) low = mid; else high = mid - 1;
      }
      const next = Number(sheets[low]?.dataset.txtPage);
      if (!next || next === pageFromParent.current) return;
      pageFromParent.current = next;
      onPageChangeRef.current?.(next, total);
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(update); }
    const observer = new ResizeObserver(schedule);
    observer.observe(node);
    node.addEventListener("scroll", schedule, { passive: true });
    schedule();
    return () => { observer.disconnect(); node.removeEventListener("scroll", schedule); cancelAnimationFrame(frame); };
  }, [total, text]);

  function bookmarkHere() {
    if (!documentId || !total) return;
    addBookmark(documentId, safePage);
    setBookmarkFlash(true);
    window.setTimeout(() => setBookmarkFlash(false), 1200);
    window.dispatchEvent(new CustomEvent("blabla:bookmarks-changed", { detail: { documentId } }));
  }

  async function runSearch() {
    const needle = searchQuery.trim();
    if (needle.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const normalizedNeedle = needle.toLowerCase();
      const hits = pages
        .flatMap((item, index) => {
          const text = normalizeSearchText(item);
          if (!text || !text.toLowerCase().includes(normalizedNeedle)) return [];
          return [{
            id: `txt-${index + 1}`,
            page: index + 1,
            label: `Лист ${index + 1}`,
            hint: `лист ${index + 1}`,
            excerpt: buildSearchExcerpt(text, needle),
            active: index + 1 === safePage,
          } satisfies TxtSearchResult];
        })
        .slice(0, 36);
      setSearchResults(hits);
    } finally {
      setSearchLoading(false);
    }
  }

  useEffect(() => {
    if (!searchOpen) return;
    const needle = searchQuery.trim();
    if (needle.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    const timer = window.setTimeout(() => {
      void runSearch();
    }, 220);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, searchOpen, searchQuery]);

  if (error) {
    return (
      <p className="rounded-2xl border border-ink/10 bg-ink/[0.02] p-8 text-center text-sm text-muted">
        Не получилось открыть текстовый файл — воспользуйтесь скачиванием.
      </p>
    );
  }

  return (
    <div
      className={
        fullscreen
          ? "relative flex h-full min-h-0 flex-col bg-paper"
          : compact
            ? "rounded-2xl border border-ink/10 bg-ink/[0.02] p-3 md:p-4"
            : "rounded-2xl border border-ink/10 bg-ink/[0.02] p-4 md:p-6"
      }
    >
      <AnchorNavigator documentId={documentId} fileUrl={url} containerRef={scrollRef} ready={text !== null} page={safePage} onNavigate={jumpToPage} />
      <div className={fullscreen ? "reader-toolbar flex flex-wrap items-center justify-between gap-3" : "mb-3 flex flex-wrap items-center justify-between gap-3"}>
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={safePage <= 1 || text == null}
            className="icon-button"
            aria-label="Предыдущий лист"
          >
            <ChevronLeft size={16} />
          </button>
          {text == null ? (
            <span className="min-w-[9rem] text-center font-mono text-xs text-muted">Загрузка…</span>
          ) : (
            <PageJumpInput
              page={safePage}
              total={total}
              display={`лист ${safePage} из ${total}`}
              compact={compact}
              onJump={jumpToPage}
            />
          )}
          <button
            type="button"
            onClick={() => go(1)}
            disabled={safePage >= total || text == null}
            className="icon-button"
            aria-label="Следующий лист"
          >
            <ChevronRight size={16} />
          </button>
          {text != null && (
            <button
              type="button"
              onClick={() => setTocOpen((o) => !o)}
              className={`inline-flex items-center gap-1.5 rounded-full border ${compact ? "px-2 py-1.5" : "px-2.5 py-1.5"} text-xs ${
                tocOpen ? "border-rust text-rust" : "border-ink/15 text-muted hover:text-ink"
              }`}
              aria-label="Оглавление"
              title="Оглавление"
            >
              <List size={14} />
              Оглавление
            </button>
          )}
          {text != null && (
            <button
              type="button"
              onClick={() => setSearchOpen((open) => !open)}
              className={`inline-flex items-center gap-1.5 rounded-full border ${compact ? "px-2 py-1.5" : "px-2.5 py-1.5"} text-xs ${
                searchOpen ? "border-rust text-rust" : "border-ink/15 text-muted hover:text-ink"
              }`}
              aria-label="Поиск по книге"
              title="Поиск по книге"
            >
              <Search size={14} />
              Поиск
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <ZoomControls value={zoom} min={0.9} max={1.6} onChange={setZoom} compact={compact} />
          <button
            type="button"
            onClick={() => setShowAnnotations((v) => !v)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${
              showAnnotations ? "border-ink/20 text-ink" : "border-rust bg-rust/10 text-rust"
            }`}
            aria-pressed={showAnnotations}
          >
            {showAnnotations ? <Eye size={14} /> : <EyeOff size={14} />}
            {showAnnotations ? "Пометки" : "Пометки скрыты"}
          </button>
          {documentId && (
            <button
              type="button"
              onClick={bookmarkHere}
              className={`icon-button ${bookmarkFlash ? "border-rust bg-rust text-white" : ""}`}
              aria-label="Поставить закладку на этот лист"
              title="Закладка"
            >
              <Bookmark size={14} />
            </button>
          )}
          {documentId && currentUserId && canAnnotate && (
            <button
              type="button"
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => setPlacing((p) => !p)}
              className={`icon-button ${placing ? "border-rust bg-rust text-white" : ""}`}
              aria-label={placing ? "Отменить добавление пометки" : "Добавить пометку"}
              title={placing ? "Кликните по тексту, чтобы поставить пометку" : "Добавить пометку"}
            >
              <MapPin size={14} />
            </button>
          )}
          {documentId && currentUserId && !canAnnotate && (
            <span className="hidden text-[11px] text-muted sm:inline" title="Пометки на тексте — у бустеров и админов">
              пометки: бустер+
            </span>
          )}
        </div>
      </div>

      <ReaderSearchPanel
        open={searchOpen}
        query={searchQuery}
        loading={searchLoading}
        results={searchResults}
        placeholder="Найти слово или фразу в тексте…"
        empty="В этом тексте совпадений не нашлось."
        countLabel={
          searchResults.length
            ? `Совпадений: ${searchResults.length}${searchResults.length >= 36 ? "+" : ""}`
            : null
        }
        onQueryChange={(value) => {
          setSearchQuery(value);
          setSearchResults([]);
        }}
        onSubmit={() => void runSearch()}
        onSelect={(id) => {
          const item = searchResults.find((entry) => entry.id === id);
          if (!item) return;
          jumpToPage(item.page);
        }}
        onClose={() => setSearchOpen(false)}
      />

      {placing && (
        <p className="mb-3 rounded-lg bg-rust/10 px-3 py-2 text-xs text-rust">
          Можно выделить фрагмент, затем кликните в нужном месте листа.
        </p>
      )}

      <div className={fullscreen ? "relative min-h-0 flex-1" : "relative"}>
        <ReaderToc
          open={Boolean(tocOpen && text != null)}
          items={toc.map((item, i) => ({
            id: `${item.page}-${i}`,
            label: item.title,
            hint: item.kind === "contents" ? undefined : `лист ${item.page}`,
            kind: item.kind,
            active: item.page === safePage,
          }))}
          empty="В этом тексте пока не нашлось явных заголовков."
          onClose={() => setTocOpen(false)}
          onSelect={(id) => {
            const page = Number.parseInt(id, 10);
            if (Number.isFinite(page)) {
              setTocOpen(false);
              jumpToPage(page);
            }
          }}
        />
        <div className={fullscreen ? "h-full min-h-0 min-w-0" : "min-w-0 flex-1"}>
          {total > 0 && (
            <div className={`${fullscreen ? "hidden" : "mb-4"} h-1 w-full overflow-hidden rounded-full bg-ink/10`}>
              <div
                className="h-full rounded-full bg-rust transition-[width] duration-300 ease-out"
                style={{ width: `${(safePage / total) * 100}%` }}
              />
            </div>
          )}

          <div
            ref={scrollRef}
            className={`overflow-y-auto rounded-xl bg-paper ${placing ? "cursor-crosshair" : ""}`}
            style={{ height: fullscreen ? "100%" : "70vh", minHeight: fullscreen ? 0 : 320 }}
          >
            {text == null ? (
              <div className="grid place-items-center py-20">
                <Loader2 className="animate-spin text-muted" />
              </div>
            ) : (
              <div className="relative">
                {pages.map((chunk, index) => (
                  <TxtSheet
                    key={index}
                    pageNumber={index + 1}
                    text={chunk}
                    zoom={zoom}
                    annotations={annotations}
                    documentId={documentId}
                    currentUserId={currentUserId ?? null}
                    placing={placing && index + 1 === safePage}
                    comments={comments}
                    onCreate={createAnnotation}
                    onDelete={deleteAnnotation}
                    onUpdate={updateAnnotation}
                    onReply={onReplyToAnnotation ?? (() => {})}
                    onReport={onReport ?? (() => {})}
                    onPlaced={() => setPlacing(false)}
                    companionTarget={companionTarget}
                    onOpenLinkedCompanion={onOpenLinkedCompanion}
                    hidden={!showAnnotations}
                  />
                ))}
                <SelectionLookup onAnnotate={canAnnotate ? () => setPlacing(true) : undefined} containerRef={scrollRef} language={language} suppressed={placing} documentId={documentId} fileUrl={url} page={safePage} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TxtSheet({
  pageNumber,
  text,
  zoom,
  annotations,
  documentId,
  currentUserId,
  placing,
  comments,
  onCreate,
  onDelete,
  onUpdate,
  onReply,
  onReport,
  onPlaced,
  companionTarget,
  onOpenLinkedCompanion,
  hidden,
}: {
  pageNumber: number;
  text: string;
  zoom: number;
  annotations: AnnotationItem[];
  documentId?: string;
  currentUserId: string | null;
  placing: boolean;
  comments: AnnotationCommentItem[];
  onCreate: (draft: AnnotationDraft) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  onUpdate: (id: string, patch: AnnotationUpdate) => Promise<void> | void;
  onReply: (annotationId: string, body: string) => Promise<void> | void;
  onReport: ((targetType: "annotation" | "comment", targetId: string) => void) | undefined;
  onPlaced: () => void;
  companionTarget?: {
    documentId: string;
    page: number | null;
    pageLabel?: string | null;
    title?: string | null;
  } | null;
  onOpenLinkedCompanion?: (item: AnnotationItem) => void;
  hidden: boolean;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={sheetRef}
      data-txt-page={pageNumber}
      className="relative border-b border-ink/10 px-5 py-8 md:px-10"
    >
      <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">лист {pageNumber}</p>
      <pre data-reader-text
        className="mx-auto max-w-[92ch] select-text whitespace-pre-wrap break-words font-serif text-ink"
        style={{ fontSize: `${15 * zoom}px`, lineHeight: 1.85 }}
      >
        {text}
      </pre>
      {documentId && (
        <AnnotationLayer
          documentId={documentId}
          pageNumber={pageNumber}
          items={annotations}
          containerRef={sheetRef}
          currentUserId={currentUserId}
          placing={placing}
          comments={comments}
          onCreate={onCreate}
          onDelete={onDelete}
          onUpdate={onUpdate}
          onReply={onReply}
          onReport={onReport ?? (() => {})}
          onPlaced={onPlaced}
          companionTarget={companionTarget}
          onOpenLinkedCompanion={onOpenLinkedCompanion}
          hidden={hidden}
        />
      )}
    </div>
  );
}
