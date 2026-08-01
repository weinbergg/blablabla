"use client";

import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  List,
  Loader2,
  MapPin,
  PenTool,
  Sparkles,
  SquareStack,
} from "lucide-react";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import {
  AnnotationLayer,
  COLOR_PRESETS,
  PAGE_DRAWING_PIN,
  PAGE_DRAWING_VIEWBOX,
  PAGE_STROKE_PRESETS,
  type AnnotationCommentItem,
  type AnnotationDraft,
  type AnnotationItem,
  type AnnotationUpdate,
  type AnnotationVisibility,
  type PageDrawSession,
  type StrokeWidthPreset,
} from "./annotation-layer";
import { SelectionLookup } from "./selection-lookup";

type SpreadMode = "single" | "double";
type FlipDirection = "forward" | "backward";

const SPREAD_KEY = "reader:spread";
const ANIMATE_KEY = "reader:page-animation";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

type PageRenderHandle = {
  promise: Promise<void>;
  cancel: () => void;
};

function renderPageSurface(
  canvas: HTMLCanvasElement,
  textLayerContainer: HTMLDivElement | null,
  pdfPage: PDFPageProxy,
  targetWidth: number,
  maxHeight?: number,
): PageRenderHandle {
  const baseViewport = pdfPage.getViewport({ scale: 1 });
  // Fitting the page purely to the available width leaves nothing stopping a
  // tall page on a wide screen from spilling past the bottom of the viewport
  // in fullscreen mode — cap the scale by the available height too, the same
  // way `object-fit: contain` would, so the whole spread always lands inside
  // the screen instead of needing a scroll to see the rest of it.
  const widthScale = targetWidth / Math.max(baseViewport.width, 1);
  const heightScale = maxHeight ? maxHeight / Math.max(baseViewport.height, 1) : Infinity;
  const scale = clamp(Math.min(widthScale, heightScale), 0.35, 3.5);
  const viewport = pdfPage.getViewport({ scale });

  let cancelled = false;
  let renderTask: { cancel: () => void; promise: Promise<unknown> } | null = null;

  const promise = (async () => {
    const context = canvas.getContext("2d");
    if (!context || targetWidth < 40) return;

    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, viewport.width, viewport.height);

    renderTask = pdfPage.render({ canvasContext: context, viewport });
    try {
      await renderTask.promise;
    } catch (error) {
      // pdf.js rejects with RenderingCancelledException when we cancel — ignore.
      if (cancelled) return;
      const name = error && typeof error === "object" && "name" in error ? String((error as { name: string }).name) : "";
      if (name === "RenderingCancelledException") return;
      throw error;
    }
    if (cancelled) return;

    // The text layer is invisible (transparent, selectable) — it exists only so
    // a reader can select a passage and anchor a sticker to it. If it fails to
    // build for any reason, reading and stickers-by-click still work fine.
    if (textLayerContainer) {
      textLayerContainer.replaceChildren();
      textLayerContainer.style.setProperty("--scale-factor", String(scale));
      textLayerContainer.style.width = `${viewport.width}px`;
      textLayerContainer.style.height = `${viewport.height}px`;
      try {
        const { TextLayer } = await import("pdfjs-dist");
        const textContent = await pdfPage.getTextContent();
        if (cancelled) return;
        const layer = new TextLayer({ textContentSource: textContent, container: textLayerContainer, viewport });
        await layer.render();
      } catch {
        // ignore — see comment above
      }
    }
  })();

  return {
    promise,
    cancel: () => {
      cancelled = true;
      try {
        renderTask?.cancel();
      } catch {
        /* already finished */
      }
    },
  };
}

export function PdfReader({
  url,
  page,
  onPageChange,
  documentId,
  currentUserId,
  initialAnnotations = [],
  comments = [],
  onReplyToAnnotation,
  onReport,
  fullscreen = false,
  canAnnotate = false,
  language,
}: {
  url: string;
  page: number;
  onPageChange: (page: number, total: number) => void;
  documentId?: string;
  currentUserId?: string | null;
  initialAnnotations?: AnnotationItem[];
  comments?: AnnotationCommentItem[];
  onReplyToAnnotation?: (annotationId: string, body: string) => Promise<void> | void;
  onReport?: (targetType: "annotation" | "comment", targetId: string) => void;
  fullscreen?: boolean;
  /** Only admins/boosters may drop new stickers on a page — everyone else can
   * still read every existing one and take part in the discussion below. */
  canAnnotate?: boolean;
  language?: string | null;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const spreadRef = useRef<HTMLDivElement>(null);
  const leftPageWrapRef = useRef<HTMLDivElement>(null);
  const rightPageWrapRef = useRef<HTMLDivElement>(null);
  const leftCanvasRef = useRef<HTMLCanvasElement>(null);
  const rightCanvasRef = useRef<HTMLCanvasElement>(null);
  const leftTextLayerRef = useRef<HTMLDivElement>(null);
  const rightTextLayerRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const prevPageRef = useRef(page);

  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [containerWidth, setContainerWidth] = useState(900);
  const [maxPageHeight, setMaxPageHeight] = useState<number | undefined>(undefined);
  const [mode, setMode] = useState<SpreadMode>("double");
  const [animate, setAnimate] = useState(true);
  const [flipNonce, setFlipNonce] = useState(0);
  const [flipDir, setFlipDir] = useState<FlipDirection>("forward");
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [annotations, setAnnotations] = useState<AnnotationItem[]>(initialAnnotations);
  const [placing, setPlacing] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [drawTargetPage, setDrawTargetPage] = useState<number | null>(null);
  const [drawPaths, setDrawPaths] = useState<string[]>([]);
  const [drawColor, setDrawColor] = useState(COLOR_PRESETS[0]);
  const [drawStrokeWidth, setDrawStrokeWidth] = useState<StrokeWidthPreset>("medium");
  const [drawVisibility, setDrawVisibility] = useState<AnnotationVisibility>("public");
  const [drawSaving, setDrawSaving] = useState(false);
  const [toc, setToc] = useState<{ title: string; page: number }[]>([]);
  const [tocOpen, setTocOpen] = useState(false);
  const pageRef = useRef(page);
  pageRef.current = page;

  useEffect(() => {
    const storedMode = window.localStorage.getItem(SPREAD_KEY);
    const storedAnimate = window.localStorage.getItem(ANIMATE_KEY);
    if (storedMode === "single" || storedMode === "double") {
      setMode(storedMode);
    } else if (window.innerWidth < 768) {
      // A spread splits the width in two, so on a phone-sized screen each
      // page would render too narrow to read — default to one page at a
      // time there unless the reader has explicitly chosen otherwise.
      setMode("single");
    }
    if (storedAnimate === "0") setAnimate(false);
    setPreferencesReady(true);
  }, []);

  useEffect(() => {
    if (!preferencesReady) return;
    window.localStorage.setItem(SPREAD_KEY, mode);
  }, [mode, preferencesReady]);

  useEffect(() => {
    if (!preferencesReady) return;
    window.localStorage.setItem(ANIMATE_KEY, animate ? "1" : "0");
  }, [animate, preferencesReady]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const loadingTask = pdfjsLib.getDocument(url);
        const doc = await loadingTask.promise;
        if (cancelled) return;
        docRef.current = doc;
        setNumPages(doc.numPages);
        // Resume wherever the parent already decided — never force page 1 and
        // wipe reading progress / ?page= deep links.
        const resume = Math.min(Math.max(pageRef.current || 1, 1), doc.numPages);
        onPageChange(resume, doc.numPages);

        try {
          const outline = await doc.getOutline();
          if (!cancelled && outline?.length) {
            const flat: { title: string; page: number }[] = [];
            async function walk(
              items: { title: string; dest: string | unknown[] | null; items?: unknown[] }[],
            ) {
              for (const item of items) {
                try {
                  let dest = item.dest;
                  if (typeof dest === "string") dest = await doc.getDestination(dest);
                  if (Array.isArray(dest) && dest[0]) {
                    const idx = await doc.getPageIndex(dest[0] as Parameters<typeof doc.getPageIndex>[0]);
                    flat.push({ title: item.title || "Раздел", page: idx + 1 });
                  }
                } catch {
                  /* skip broken outline entries */
                }
                if (item.items?.length) {
                  await walk(item.items as { title: string; dest: string | unknown[] | null; items?: unknown[] }[]);
                }
              }
            }
            await walk(outline);
            if (!cancelled) setToc(flat.slice(0, 200));
          }
        } catch {
          /* outline optional */
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  useEffect(() => {
    const el = containerRef.current;
    const root = rootRef.current;
    if (!el || !root) return;

    // Measured from the container's actual position rather than a guessed
    // "chrome height" constant, so it stays correct regardless of exactly
    // how tall the toolbar/header/progress bar above it render — and
    // crucially, that height changes whenever *they* do, not just when the
    // window itself is resized. On a narrow screen the toolbar's buttons
    // wrap onto a second line (and the on-screen keyboard can appear/
    // disappear), which shifts the container down without ever firing a
    // window "resize" event; watching the whole reader root, not just the
    // page container, is what catches that and is the actual fix for the
    // page occasionally rendering taller than the visible screen.
    function update() {
      const width = Math.round(el!.getBoundingClientRect().width);
      // Ignore sub-pixel / canvas-driven jitter — each width change restarts
      // pdf.js paints, and a mid-paint cancel was blanking the first spread.
      if (width >= 80) {
        setContainerWidth((prev) => (Math.abs(prev - width) < 2 ? prev : width));
      }
      if (!fullscreen) {
        setMaxPageHeight(undefined);
        return;
      }
      const top = el!.getBoundingClientRect().top;
      const bottomBreathingRoom = 12;
      const nextHeight = Math.max(240, Math.round(window.innerHeight - top - bottomBreathingRoom));
      setMaxPageHeight((prev) => (prev !== undefined && Math.abs(prev - nextHeight) < 2 ? prev : nextHeight));
    }

    const observer = new ResizeObserver(update);
    observer.observe(root);
    // The container itself can also change size without the root doing so
    // (e.g. the canvas growing) — observe both to be safe.
    observer.observe(el);
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
    if (page === prevPageRef.current) return;
    setFlipDir(page > prevPageRef.current ? "forward" : "backward");
    setFlipNonce((n) => n + 1);
    prevPageRef.current = page;
  }, [page]);

  // Restart the CSS flip animation on the *same* DOM node (never remount the
  // canvases) so the previously rendered page stays visible instead of
  // flashing blank while the next page is still being drawn.
  useEffect(() => {
    const el = spreadRef.current;
    if (!el || !animate || flipNonce === 0) return;
    const className = flipDir === "forward" ? "page-flip-forward" : "page-flip-backward";
    el.classList.remove("page-flip-forward", "page-flip-backward");
    // Force reflow so the browser registers the class removal before it's re-added.
    void el.offsetWidth;
    el.classList.add(className);
  }, [flipNonce, flipDir, animate]);

  const isDouble = mode === "double" && numPages > 1;
  const spreadStart = isDouble ? (page % 2 === 0 ? page - 1 : page) : page;
  const leftPageNumber = clamp(spreadStart, 1, Math.max(numPages, 1));
  const rightPageNumber = isDouble && leftPageNumber + 1 <= numPages ? leftPageNumber + 1 : null;

  useEffect(() => {
    // Wait until layout + spread preference are settled. Rendering into a
    // guessed width (or before the right-hand canvas mounts) was leaving the
    // first spread blank until the reader flipped a page and back.
    if (!docRef.current || !numPages || loading || !preferencesReady) return;
    if (containerWidth < 80) return;

    let cancelled = false;
    const handles: PageRenderHandle[] = [];
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    async function paint(attempt = 0) {
      if (cancelled || !docRef.current) return;
      const gap = isDouble ? 28 : 0;
      const perPageWidth = Math.max(40, isDouble ? (containerWidth - gap) / 2 : containerWidth);

      // One rAF so the conditional right-page canvas is in the DOM after mode
      // flips double↔single / loading→ready.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (cancelled) return;

      const leftCanvas = leftCanvasRef.current;
      if (!leftCanvas) {
        if (attempt < 8) {
          retryTimer = setTimeout(() => void paint(attempt + 1), 50);
        }
        return;
      }
      if (rightPageNumber && !rightCanvasRef.current) {
        if (attempt < 8) {
          retryTimer = setTimeout(() => void paint(attempt + 1), 50);
        }
        return;
      }

      try {
        const leftPage = await docRef.current.getPage(leftPageNumber);
        if (cancelled) return;
        const left = renderPageSurface(
          leftCanvas,
          leftTextLayerRef.current,
          leftPage,
          perPageWidth,
          maxPageHeight,
        );
        handles.push(left);
        await left.promise;
        if (cancelled) return;

        if (rightPageNumber && rightCanvasRef.current) {
          const rightPage = await docRef.current.getPage(rightPageNumber);
          if (cancelled) return;
          const right = renderPageSurface(
            rightCanvasRef.current,
            rightTextLayerRef.current,
            rightPage,
            perPageWidth,
            maxPageHeight,
          );
          handles.push(right);
          await right.promise;
        }
      } catch {
        if (!cancelled && attempt < 3) {
          retryTimer = setTimeout(() => void paint(attempt + 1), 80);
        }
      }
    }

    void paint();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      for (const handle of handles) handle.cancel();
    };
  }, [
    leftPageNumber,
    rightPageNumber,
    isDouble,
    numPages,
    containerWidth,
    maxPageHeight,
    loading,
    preferencesReady,
  ]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "ArrowRight") goNext();
      if (event.key === "ArrowLeft") goPrev();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, numPages, isDouble]);

  /** Turning the page while an un-saved page drawing is in progress would
   * silently strand it (the overlay only shows on the page it started on) —
   * so this is the one place we interrupt navigation to ask first. */
  function confirmDiscardDrawing() {
    if (!drawTargetPage || !drawPaths.length) return true;
    const ok = window.confirm("Рисунок на странице ещё не сохранён. Уйти со страницы и потерять его?");
    if (ok) cancelPageDrawing();
    return ok;
  }

  function goPrev() {
    if (!confirmDiscardDrawing()) return;
    const step = isDouble ? 2 : 1;
    onPageChange(Math.max(1, leftPageNumber - step), numPages);
  }

  function goNext() {
    if (!confirmDiscardDrawing()) return;
    const step = isDouble ? 2 : 1;
    onPageChange(Math.min(numPages, leftPageNumber + step), numPages);
  }

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

  async function updateAnnotation(id: string, patch: AnnotationUpdate) {
    setAnnotations((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              ...patch,
              allowDiscussion:
                patch.allowDiscussion !== undefined
                  ? patch.allowDiscussion &&
                    (patch.visibility ?? item.visibility) === "public"
                  : item.allowDiscussion,
            }
          : item,
      ),
    );
    await fetch(`/api/annotations/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  function toggleDrawMode() {
    setDrawMode((current) => !current);
    setDrawTargetPage(null);
    setDrawPaths([]);
    setDrawStrokeWidth("medium");
    setPlacing(false);
  }

  function cancelPageDrawing() {
    setDrawTargetPage(null);
    setDrawPaths([]);
  }

  async function savePageDrawing() {
    if (drawTargetPage == null || !drawPaths.length) return;
    setDrawSaving(true);
    await createAnnotation({
      page: drawTargetPage,
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
    setDrawTargetPage(null);
    setDrawPaths([]);
    setDrawMode(false);
  }

  /** Builds the shared drawing-session prop for one of the (up to two) pages
   * on screen — see `PageDrawSession` for why both need to know about each
   * other even though only one ends up owning the strokes. */
  function pageDrawSessionFor(pageNumber: number): PageDrawSession | undefined {
    if (!drawMode) return undefined;
    const isTarget = drawTargetPage === pageNumber;
    return {
      active: drawTargetPage === null || isTarget,
      isTarget,
      paths: isTarget ? drawPaths : [],
      color: drawColor,
      strokeWidthPreset: drawStrokeWidth,
      visibility: drawVisibility,
      saving: drawSaving,
      onStart: () => setDrawTargetPage(pageNumber),
      onPathsChange: setDrawPaths,
      onColorChange: setDrawColor,
      onStrokeWidthPresetChange: setDrawStrokeWidth,
      onVisibilityChange: setDrawVisibility,
      onCancel: cancelPageDrawing,
      onSave: savePageDrawing,
    };
  }

  if (error) {
    return (
      <p className="rounded-2xl border border-ink/10 bg-ink/[0.02] p-8 text-center text-sm text-muted">
        Не получилось открыть файл для чтения в браузере — воспользуйтесь
        скачиванием.
      </p>
    );
  }

  const pageLabel = rightPageNumber
    ? `стр. ${leftPageNumber}–${rightPageNumber} из ${numPages}`
    : `стр. ${leftPageNumber} из ${numPages}`;

  const annotationHandlers = {
    currentUserId: currentUserId ?? null,
    placing,
    comments,
    onCreate: createAnnotation,
    onDelete: deleteAnnotation,
    onUpdate: updateAnnotation,
    onReply: onReplyToAnnotation ?? (() => {}),
    onReport: onReport ?? (() => {}),
    onPlaced: () => setPlacing(false),
  };

  return (
    <div
      ref={rootRef}
      className={
        fullscreen
          ? "rounded-2xl border border-ink/10 bg-ink/[0.02] p-2 md:p-2.5"
          : "rounded-2xl border border-ink/10 bg-ink/[0.02] p-4 md:p-7"
      }
    >
      <div className={fullscreen ? "mb-2 flex flex-wrap items-center justify-between gap-3" : "mb-4 flex flex-wrap items-center justify-between gap-3"}>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goPrev}
            disabled={leftPageNumber <= 1}
            className="icon-button"
            aria-label="Предыдущая страница"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-[9rem] text-center font-mono text-xs text-muted">
            {loading ? "Загрузка…" : pageLabel}
          </span>
          <button
            type="button"
            onClick={goNext}
            disabled={rightPageNumber ? rightPageNumber >= numPages : leftPageNumber >= numPages}
            className="icon-button"
            aria-label="Следующая страница"
          >
            <ChevronRight size={16} />
          </button>
          {toc.length > 0 && (
            <button
              type="button"
              onClick={() => setTocOpen((o) => !o)}
              className={`icon-button ${tocOpen ? "border-rust text-rust" : ""}`}
              aria-label="Оглавление"
              title="Оглавление"
            >
              <List size={14} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-full border border-ink/10 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMode("single")}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors ${
                mode === "single" ? "bg-ink text-paper" : "text-muted hover:text-ink"
              }`}
            >
              <BookOpen size={13} />
              1 страница
            </button>
            <button
              type="button"
              onClick={() => setMode("double")}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors ${
                mode === "double" ? "bg-ink text-paper" : "text-muted hover:text-ink"
              }`}
            >
              <SquareStack size={13} />
              Разворот
            </button>
          </div>
          <button
            type="button"
            onClick={() => setAnimate((a) => !a)}
            className={`icon-button ${animate ? "border-rust/50 text-rust" : ""}`}
            aria-label={animate ? "Выключить анимацию перелистывания" : "Включить анимацию перелистывания"}
            title={animate ? "Анимация перелистывания: вкл" : "Анимация перелистывания: выкл"}
          >
            <Sparkles size={14} />
          </button>
          {documentId && currentUserId && canAnnotate && (
            <>
              <button
                type="button"
                onClick={() => {
                  setPlacing((p) => !p);
                  setDrawMode(false);
                  setDrawTargetPage(null);
                  setDrawPaths([]);
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
            </>
          )}
        </div>
      </div>

      {tocOpen && toc.length > 0 && (
        <div className="mb-3 max-h-48 overflow-y-auto rounded-xl border border-ink/10 bg-paper p-2">
          <p className="mb-1 px-2 font-mono text-[10px] uppercase tracking-widest text-muted">
            Оглавление
          </p>
          <ul className="columns-1 gap-x-4 sm:columns-2">
            {toc.map((item, i) => (
              <li key={`${item.page}-${i}`} className="break-inside-avoid">
                <button
                  type="button"
                  className="w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-ink/[0.04]"
                  onClick={() => {
                    onPageChange(item.page, numPages);
                    setTocOpen(false);
                  }}
                >
                  <span className="text-ink">{item.title}</span>
                  <span className="ml-2 font-mono text-[10px] text-muted">стр. {item.page}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {placing && (
        <p className="mb-3 rounded-lg bg-rust/10 px-3 py-2 text-xs text-rust">
          Выделите фрагмент текста (необязательно), затем кликните в нужном месте, чтобы поставить пометку.
        </p>
      )}
      {drawMode && drawTargetPage === null && (
        <p className="mb-3 rounded-lg bg-rust/10 px-3 py-2 text-xs text-rust">
          Проведите пальцем или мышью прямо по странице, чтобы начать рисовать.
        </p>
      )}

      {numPages > 0 && (
        <div className={`${fullscreen ? "mb-2" : "mb-4"} h-1 w-full overflow-hidden rounded-full bg-ink/10`}>
          <div
            className="h-full rounded-full bg-rust transition-[width] duration-300 ease-out"
            style={{ width: `${(Math.min(rightPageNumber ?? leftPageNumber, numPages) / numPages) * 100}%` }}
          />
        </div>
      )}

      <div
        ref={containerRef}
        className={fullscreen ? "relative" : "relative min-h-[65vh]"}
        style={{ perspective: "2200px" }}
      >
        {loading ? (
          <div className="flex min-h-[65vh] items-center justify-center">
            <Loader2 className="animate-spin text-muted" />
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={goPrev}
              disabled={leftPageNumber <= 1}
              aria-label="Предыдущая страница"
              className="group absolute inset-y-0 left-0 z-10 hidden w-16 items-center justify-start disabled:cursor-default md:flex"
            >
              <span className="ml-1 grid size-11 place-items-center rounded-full border border-ink/10 bg-paper/90 text-muted opacity-0 shadow-sm transition-all group-hover:opacity-100 group-disabled:!opacity-0 group-hover:border-ink/20 group-hover:text-ink">
                <ChevronLeft size={20} />
              </span>
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={rightPageNumber ? rightPageNumber >= numPages : leftPageNumber >= numPages}
              aria-label="Следующая страница"
              className="group absolute inset-y-0 right-0 z-10 hidden w-16 items-center justify-end disabled:cursor-default md:flex"
            >
              <span className="mr-1 grid size-11 place-items-center rounded-full border border-ink/10 bg-paper/90 text-muted opacity-0 shadow-sm transition-all group-hover:opacity-100 group-disabled:!opacity-0 group-hover:border-ink/20 group-hover:text-ink">
                <ChevronRight size={20} />
              </span>
            </button>

            <div ref={spreadRef} className="flex justify-center gap-7">
              <div ref={leftPageWrapRef} className="relative">
                <canvas ref={leftCanvasRef} className="block max-w-full rounded-lg bg-white shadow-sm" />
                <div ref={leftTextLayerRef} className="textLayer" />
                <AnnotationLayer
                  pageNumber={leftPageNumber}
                  items={annotations}
                  containerRef={leftPageWrapRef}
                  pageDraw={pageDrawSessionFor(leftPageNumber)}
                  {...annotationHandlers}
                />
                <SelectionLookup
                  containerRef={leftPageWrapRef}
                  suppressed={placing || drawMode}
                  language={language}
                />
              </div>
              {isDouble && (
                <div ref={rightPageWrapRef} className="relative">
                  <canvas ref={rightCanvasRef} className="block max-w-full rounded-lg bg-white shadow-sm" />
                  <div ref={rightTextLayerRef} className="textLayer" />
                  <AnnotationLayer
                    pageNumber={rightPageNumber}
                    items={annotations}
                    containerRef={rightPageWrapRef}
                    pageDraw={rightPageNumber ? pageDrawSessionFor(rightPageNumber) : undefined}
                    {...annotationHandlers}
                  />
                  <SelectionLookup
                    containerRef={rightPageWrapRef}
                    suppressed={placing || drawMode}
                    language={language}
                  />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
