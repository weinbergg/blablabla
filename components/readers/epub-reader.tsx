"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, MapPin, PenTool } from "lucide-react";
import {
  AnnotationLayer,
  COLOR_PRESETS,
  PAGE_DRAWING_PIN,
  PAGE_DRAWING_VIEWBOX,
  PAGE_STROKE_PRESETS,
  type AnnotationCommentItem,
  type AnnotationDraft,
  type AnnotationItem,
  type AnnotationVisibility,
  type PageDrawSession,
  type StrokeWidthPreset,
} from "./annotation-layer";
import { SelectionLookup } from "./selection-lookup";

/**
 * EPUB annotations are keyed by spine section index rather than a PDF-style
 * pixel-accurate page, since reflowable content has no such stable concept
 * (it reshuffles with font size/viewport). A section is still a perfectly
 * good, stable anchor — the same chapter is always the same section index —
 * it's just coarser than a PDF page.
 *
 * Book content itself renders inside an iframe (epub.js's own doing), so a
 * normal DOM click there never reaches this component's listeners — the two
 * documents don't bubble events across the boundary. Rather than forwarding
 * synthetic events across that gap, a transparent capture layer is placed on
 * top of the iframe only while placing a sticker or drawing, which is also
 * arguably better UX: it makes unambiguous that you're marking the page, not
 * navigating/selecting it.
 */
export function EpubReader({
  url,
  page,
  onPageChange,
  fullscreen = false,
  documentId,
  currentUserId,
  initialAnnotations = [],
  comments = [],
  onReplyToAnnotation,
  onReport,
  canAnnotate = false,
  language,
}: {
  url: string;
  page: number;
  onPageChange: (page: number, total: number) => void;
  fullscreen?: boolean;
  documentId?: string;
  currentUserId?: string | null;
  initialAnnotations?: AnnotationItem[];
  comments?: AnnotationCommentItem[];
  onReplyToAnnotation?: (annotationId: string, body: string) => Promise<void> | void;
  onReport?: (targetType: "annotation" | "comment", targetId: string) => void;
  canAnnotate?: boolean;
  language?: string | null;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<import("epubjs").Rendition | null>(null);
  const sectionRef = useRef(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [section, setSection] = useState(1);
  const [totalSections, setTotalSections] = useState(0);
  // A fixed "70vh" reads fine outside fullscreen, but in fullscreen mode it
  // wastes most of the screen on a tall monitor and can overflow it on a
  // short one (a phone in landscape, or a laptop with a tall toolbar/URL
  // bar) — so in fullscreen the height instead tracks the actual space
  // between the reader and the bottom of the viewport, the same approach
  // used for the PDF reader.
  const [height, setHeight] = useState("70vh");

  const [annotations, setAnnotations] = useState<AnnotationItem[]>(initialAnnotations);
  // The book's own text lives inside epub.js's iframe, a separate document
  // from this component's — tracked here so `SelectionLookup` can watch
  // *that* document's selection instead of the outer page's (which never
  // sees a selection made inside the iframe at all).
  const [selectionDoc, setSelectionDoc] = useState<Document | null>(null);
  const [placing, setPlacing] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [drawPaths, setDrawPaths] = useState<string[]>([]);
  const [drawColor, setDrawColor] = useState(COLOR_PRESETS[0]);
  const [drawStrokeWidth, setDrawStrokeWidth] = useState<StrokeWidthPreset>("medium");
  const [drawVisibility, setDrawVisibility] = useState<AnnotationVisibility>("public");
  const [drawSaving, setDrawSaving] = useState(false);

  useEffect(() => setAnnotations(initialAnnotations), [initialAnnotations]);

  useEffect(() => {
    if (!fullscreen) {
      setHeight("70vh");
      return;
    }
    const root = rootRef.current;
    if (!root) return;
    function update() {
      const top = root!.getBoundingClientRect().top;
      setHeight(`${Math.max(240, window.innerHeight - top - 12)}px`);
    }
    const observer = new ResizeObserver(update);
    observer.observe(root);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, [fullscreen]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const ePub = (await import("epubjs")).default;
        if (!containerRef.current) return;
        const book = ePub(url);
        const rendition = book.renderTo(containerRef.current, {
          width: "100%",
          height: "100%",
        });
        renditionRef.current = rendition;

        function syncSelectionDoc() {
          const contentsList = rendition.getContents() as unknown as { document: Document }[];
          setSelectionDoc(contentsList[0]?.document ?? null);
        }

        rendition.on("relocated", (location: { start: { index: number } }) => {
          const total = (book.spine as unknown as { length?: number }).length || 1;
          const index = location.start.index + 1;
          sectionRef.current = index;
          setSection(index);
          setTotalSections(total);
          onPageChange(index, total);
          syncSelectionDoc();
        });

        await book.ready;
        await rendition.display();
        syncSelectionDoc();
        if (!cancelled) setLoading(false);
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      renditionRef.current?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // Lets the outer "Пометки на страницах" index jump straight to a section —
  // only acts when the target actually differs from where we already are,
  // so it doesn't fight with `relocated` echoing the same section back.
  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition || !page || page === sectionRef.current) return;
    const target = rendition.book.spine.get(page - 1);
    if (target?.href) {
      sectionRef.current = page;
      rendition.display(target.href);
    }
  }, [page]);

  async function createAnnotation(draft: AnnotationDraft) {
    if (!documentId) return;
    const response = await fetch("/api/annotations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId, ...draft }),
    });
    if (!response.ok) return;
    const { id } = (await response.json()) as { id: string };
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
        anchorText: draft.anchorText,
        anchorRects: draft.anchorRects,
        createdAt: new Date().toISOString(),
      },
    ]);
  }

  async function deleteAnnotation(id: string) {
    setAnnotations((current) => current.filter((item) => item.id !== id));
    await fetch(`/api/annotations/${id}`, { method: "DELETE" });
  }

  function toggleDrawMode() {
    setDrawMode((current) => !current);
    setDrawPaths([]);
    setDrawStrokeWidth("medium");
    setPlacing(false);
  }

  async function savePageDrawing() {
    if (!drawPaths.length) return;
    setDrawSaving(true);
    await createAnnotation({
      page: sectionRef.current,
      x: PAGE_DRAWING_PIN.x,
      y: PAGE_DRAWING_PIN.y,
      shape: "drawing",
      color: drawColor,
      body: JSON.stringify({
        paths: drawPaths,
        viewBox: PAGE_DRAWING_VIEWBOX,
        fullPage: true,
        strokeWidth: PAGE_STROKE_PRESETS[drawStrokeWidth],
      }),
      visibility: drawVisibility,
      allowDiscussion: false,
      anchorText: null,
      anchorRects: null,
    });
    setDrawSaving(false);
    setDrawPaths([]);
    setDrawMode(false);
  }

  // Only ever one section on screen at a time (no spread mode for EPUB), so
  // unlike the PDF reader's two-page version of this session object, there's
  // no ambiguity about which page "owns" the in-progress strokes.
  const pageDrawSession: PageDrawSession | undefined = drawMode
    ? {
        active: true,
        isTarget: true,
        paths: drawPaths,
        color: drawColor,
        strokeWidthPreset: drawStrokeWidth,
        visibility: drawVisibility,
        saving: drawSaving,
        onStart: () => {},
        onPathsChange: setDrawPaths,
        onColorChange: setDrawColor,
        onStrokeWidthPresetChange: setDrawStrokeWidth,
        onVisibilityChange: setDrawVisibility,
        onCancel: () => {
          setDrawPaths([]);
          setDrawMode(false);
        },
        onSave: savePageDrawing,
      }
    : undefined;

  if (error) {
    return (
      <p className="rounded-2xl border border-ink/10 bg-ink/[0.02] p-8 text-center text-sm text-muted">
        Не получилось открыть файл для чтения в браузере — воспользуйтесь
        скачиванием.
      </p>
    );
  }

  return (
    <div
      ref={rootRef}
      className={
        fullscreen
          ? "rounded-2xl border border-ink/10 bg-ink/[0.02] p-2 md:p-2.5"
          : "rounded-2xl border border-ink/10 bg-ink/[0.02] p-4 md:p-6"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 md:pb-4">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => renditionRef.current?.prev()} className="icon-button" aria-label="Предыдущая страница">
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-[9rem] text-center font-mono text-xs text-muted" title="У EPUB считаются разделы оглавления (главы), а не бумажные страницы — книга обычно полная">
            {totalSections ? `глава ${section} / ${totalSections}` : "EPUB"}
          </span>
          <button type="button" onClick={() => renditionRef.current?.next()} className="icon-button" aria-label="Следующая страница">
            <ChevronRight size={16} />
          </button>
        </div>
        {documentId && currentUserId && canAnnotate && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setPlacing((p) => !p);
                setDrawMode(false);
              }}
              className={`icon-button ${placing ? "border-rust bg-rust text-white" : ""}`}
              aria-label={placing ? "Отменить добавление пометки" : "Добавить пометку на страницу"}
              title={placing ? "Кликните на странице, чтобы поставить пометку" : "Добавить пометку"}
            >
              <MapPin size={14} />
            </button>
            <button
              type="button"
              onClick={toggleDrawMode}
              className={`icon-button ${drawMode ? "border-rust bg-rust text-white" : ""}`}
              aria-label={drawMode ? "Выключить рисование на странице" : "Рисовать на странице"}
              title={drawMode ? "Выключить рисование на странице" : "Рисовать прямо на странице"}
            >
              <PenTool size={14} />
            </button>
          </div>
        )}
      </div>

      {placing && (
        <p className="mb-3 rounded-lg bg-rust/10 px-3 py-2 text-xs text-rust">
          Кликните в нужном месте страницы, чтобы поставить пометку.
        </p>
      )}
      {drawMode && (
        <p className="mb-3 rounded-lg bg-rust/10 px-3 py-2 text-xs text-rust">
          Проведите пальцем или мышью прямо по странице, чтобы начать рисовать.
        </p>
      )}

      <div ref={wrapRef} className="relative" style={{ height, minHeight: 240 }}>
        {loading && (
          <div className="absolute inset-0 z-10 grid place-items-center">
            <Loader2 className="animate-spin text-muted" />
          </div>
        )}
        <div ref={containerRef} className="h-full" />
        {placing && !drawMode && <div className="absolute inset-0 z-20 cursor-crosshair" />}
        {documentId && (
          <AnnotationLayer
            pageNumber={section}
            items={annotations}
            containerRef={wrapRef}
            currentUserId={currentUserId ?? null}
            placing={placing}
            comments={comments}
            onCreate={createAnnotation}
            onDelete={deleteAnnotation}
            onReply={onReplyToAnnotation ?? (() => {})}
            onReport={onReport ?? (() => {})}
            onPlaced={() => setPlacing(false)}
            pageDraw={pageDrawSession}
          />
        )}
        <SelectionLookup
          containerRef={wrapRef}
          doc={selectionDoc}
          suppressed={placing || drawMode}
          language={language}
        />
      </div>
    </div>
  );
}
