"use client";

import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MapPin,
  Sparkles,
  SquareStack,
} from "lucide-react";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import {
  AnnotationLayer,
  type AnnotationCommentItem,
  type AnnotationDraft,
  type AnnotationItem,
} from "./annotation-layer";

type SpreadMode = "single" | "double";
type FlipDirection = "forward" | "backward";

const SPREAD_KEY = "reader:spread";
const ANIMATE_KEY = "reader:page-animation";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

async function renderPageSurface(
  canvas: HTMLCanvasElement,
  textLayerContainer: HTMLDivElement | null,
  pdfPage: PDFPageProxy,
  targetWidth: number,
  maxHeight?: number,
) {
  const baseViewport = pdfPage.getViewport({ scale: 1 });
  // Fitting the page purely to the available width leaves nothing stopping a
  // tall page on a wide screen from spilling past the bottom of the viewport
  // in fullscreen mode — cap the scale by the available height too, the same
  // way `object-fit: contain` would, so the whole spread always lands inside
  // the screen instead of needing a scroll to see the rest of it.
  const widthScale = targetWidth / baseViewport.width;
  const heightScale = maxHeight ? maxHeight / baseViewport.height : Infinity;
  const scale = clamp(Math.min(widthScale, heightScale), 0.35, 3.5);
  const viewport = pdfPage.getViewport({ scale });

  const context = canvas.getContext("2d");
  if (context) {
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    await pdfPage.render({ canvasContext: context, viewport }).promise;
  }

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
      const layer = new TextLayer({ textContentSource: textContent, container: textLayerContainer, viewport });
      await layer.render();
    } catch {
      // ignore — see comment above
    }
  }
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
}) {
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

  useEffect(() => {
    const storedMode = window.localStorage.getItem(SPREAD_KEY);
    const storedAnimate = window.localStorage.getItem(ANIMATE_KEY);
    if (storedMode === "single" || storedMode === "double") setMode(storedMode);
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
        onPageChange(1, doc.numPages);
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
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setContainerWidth(width);
    });
    observer.observe(el);
    // The observer only fires once the browser actually recomputes layout —
    // reading the current box synchronously right after a fullscreen toggle
    // means the very first page render already targets the right width
    // instead of one frame at the old (small or huge) size.
    setContainerWidth(el.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, [fullscreen]);

  useEffect(() => {
    if (!fullscreen) {
      setMaxPageHeight(undefined);
      return;
    }
    // Measured from the container's actual position rather than a guessed
    // "chrome height" constant, so it stays correct regardless of exactly
    // how tall the toolbar/header/progress bar above it render.
    function update() {
      const el = containerRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const bottomBreathingRoom = 12;
      setMaxPageHeight(Math.max(320, window.innerHeight - top - bottomBreathingRoom));
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
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
    if (!docRef.current || !numPages) return;
    let cancelled = false;

    (async () => {
      const gap = isDouble ? 28 : 0;
      const perPageWidth = isDouble ? (containerWidth - gap) / 2 : containerWidth;

      const leftPage = await docRef.current!.getPage(leftPageNumber);
      if (cancelled) return;
      if (leftCanvasRef.current) {
        await renderPageSurface(leftCanvasRef.current, leftTextLayerRef.current, leftPage, perPageWidth, maxPageHeight);
      }

      if (rightPageNumber) {
        const rightPage = await docRef.current!.getPage(rightPageNumber);
        if (cancelled) return;
        if (rightCanvasRef.current) {
          await renderPageSurface(rightCanvasRef.current, rightTextLayerRef.current, rightPage, perPageWidth, maxPageHeight);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [leftPageNumber, rightPageNumber, isDouble, numPages, containerWidth, maxPageHeight]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "ArrowRight") goNext();
      if (event.key === "ArrowLeft") goPrev();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, numPages, isDouble]);

  function goPrev() {
    const step = isDouble ? 2 : 1;
    onPageChange(Math.max(1, leftPageNumber - step), numPages);
  }

  function goNext() {
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
    onReply: onReplyToAnnotation ?? (() => {}),
    onReport: onReport ?? (() => {}),
    onPlaced: () => setPlacing(false),
  };

  return (
    <div
      className={
        fullscreen
          ? "rounded-2xl border border-ink/10 bg-ink/[0.02] p-2.5"
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
            <button
              type="button"
              onClick={() => setPlacing((p) => !p)}
              className={`icon-button ${placing ? "border-rust bg-rust text-white" : ""}`}
              aria-label={placing ? "Отменить добавление пометки" : "Добавить пометку на страницу"}
              title={placing ? "Кликните на странице, чтобы поставить пометку" : "Добавить пометку"}
            >
              <MapPin size={14} />
            </button>
          )}
        </div>
      </div>

      {placing && (
        <p className="mb-3 rounded-lg bg-rust/10 px-3 py-2 text-xs text-rust">
          Выделите фрагмент текста (необязательно), затем кликните в нужном месте, чтобы поставить пометку.
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
                  {...annotationHandlers}
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
                    {...annotationHandlers}
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
