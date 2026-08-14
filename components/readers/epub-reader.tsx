"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, EyeOff, List, Loader2, MapPin, PenTool, Bookmark } from "lucide-react";
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
import { PageJumpInput } from "./page-jump-input";
import { SelectionLookup } from "./selection-lookup";
import { addBookmark } from "@/lib/bookmarks";
import { isTypingTarget } from "@/lib/reader-keys";

type TocItem = { label: string; href: string };
/**
 * EPUB annotations are keyed by spine section index rather than a PDF-style
 * pixel-accurate page, since reflowable content has no such stable concept
 * (it reshuffles with font size/viewport). A section is still a perfectly
 * good, stable anchor — the same chapter is always the same section index —
 * it's just coarser than a PDF page.
 *
 * Full-page drawings additionally store `screenKey` (`spine:pageWithinSection`)
 * because epub.js paginates long chapters into many visual screens that share
 * one spine index — without that key a drawing would paint on every screen.
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
  const screenKeyRef = useRef("1:1");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [section, setSection] = useState(1);
  const [screenKey, setScreenKey] = useState("1:1");
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
  const [toc, setToc] = useState<TocItem[]>([]);
  const [tocOpen, setTocOpen] = useState(false);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [bookmarkFlash, setBookmarkFlash] = useState(false);
  const [stubWarning, setStubWarning] = useState(false);
  // Refs so the `relocated` handler (created once per book) can see live draw state.
  const drawPathsRef = useRef(drawPaths);
  const drawModeRef = useRef(drawMode);
  useEffect(() => {
    drawPathsRef.current = drawPaths;
  }, [drawPaths]);
  useEffect(() => {
    drawModeRef.current = drawMode;
  }, [drawMode]);

  useEffect(() => setAnnotations(initialAnnotations), [initialAnnotations]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      if (isTypingTarget(event.target)) return;
      if (event.key === "ArrowRight") renditionRef.current?.next();
      if (event.key === "ArrowLeft") renditionRef.current?.prev();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

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

        rendition.on(
          "relocated",
          (location: {
            start: { index: number; cfi?: string; displayed?: { page: number; total: number } };
          }) => {
            const total = (book.spine as unknown as { length?: number }).length || 1;
            const index = location.start.index + 1;
            // Paginated EPUB: many visual screens share one spine index.
            // Scrolled mode has no displayed.page — treat the whole section as one screen.
            const nextScreenKey = `${index}:${location.start.displayed?.page ?? 1}`;

            // epub.js has already moved; drop an unsaved drawing so it cannot
            // stick to the new visual screen of the same spine section.
            if (
              screenKeyRef.current !== nextScreenKey &&
              drawModeRef.current &&
              drawPathsRef.current.length > 0
            ) {
              setDrawPaths([]);
              setDrawMode(false);
            }

            sectionRef.current = index;
            screenKeyRef.current = nextScreenKey;
            setSection(index);
            setScreenKey(nextScreenKey);
            setTotalSections(total);
            onPageChange(index, total);
            syncSelectionDoc();
          },
        );

        // Keep in-book TOC / chapter hyperlinks inside the reader and sync the
        // section counter (epub.js already calls display(); we just mirror state).
        rendition.on("rendered", syncSelectionDoc);

        await book.ready;
        try {
          const nav = await book.loaded.navigation;
          const flat: TocItem[] = [];
          function walk(items: { label?: string; href?: string; subitems?: unknown[] }[]) {
            for (const item of items ?? []) {
              if (item.label && item.href) flat.push({ label: item.label.trim(), href: item.href });
              if (item.subitems?.length) walk(item.subitems as typeof items);
            }
          }
          walk((nav?.toc ?? []) as { label?: string; href?: string; subitems?: unknown[] }[]);
          if (!cancelled) setToc(flat);

          // Prefer landing on the first real chapter: Gutenberg EPUBs often open
          // on a Contents HTML page of blue links (the screenshot complaint).
          const firstChapter =
            flat.find((t) => /book\s|canto|chapter|глава|песн|часть/i.test(t.label)) ??
            flat[1] ??
            flat[0];
          if (firstChapter?.href) {
            await rendition.display(firstChapter.href);
          } else {
            await rendition.display();
          }

          // Stub / TOC-shell detection: if the opened chapter is almost only links,
          // warn the reader (many Gutenberg "EPUB" shells have no continuous text).
          try {
            const contents = rendition.getContents();
            const docs = Array.isArray(contents) ? contents : contents ? [contents] : [];
            let words = 0;
            let links = 0;
            for (const c of docs) {
              const doc = (c as { document?: Document }).document;
              if (!doc?.body) continue;
              const text = (doc.body.textContent || "").replace(/\s+/g, " ").trim();
              words += (text.match(/[A-Za-zА-Яа-яЁё\u0370-\u03FF]{2,}/g) ?? []).length;
              links += doc.body.querySelectorAll("a[href]").length;
            }
            if ((links >= 20 && words / Math.max(links, 1) < 12) || (words < 120 && links >= 8)) {
              if (!cancelled) setStubWarning(true);
            }
          } catch {
            /* ignore */
          }
        } catch {
          await rendition.display();
        }
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
        screenKey: screenKeyRef.current,
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
          <PageJumpInput
            page={section}
            total={totalSections}
            label="глава"
            display={totalSections ? `глава ${section} / ${totalSections}` : "EPUB"}
            onJump={(target) => {
              const spine = renditionRef.current?.book.spine.get(target - 1);
              if (spine?.href) renditionRef.current?.display(spine.href);
            }}
          />
          <button type="button" onClick={() => renditionRef.current?.next()} className="icon-button" aria-label="Следующая страница">
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
          <button
            type="button"
            onClick={() => setShowAnnotations((v) => !v)}
            className={`icon-button ${!showAnnotations ? "border-rust text-rust" : ""}`}
            aria-label={showAnnotations ? "Скрыть пометки" : "Показать пометки"}
            title={showAnnotations ? "Скрыть пометки и рисунки" : "Показать пометки и рисунки"}
          >
            {showAnnotations ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
          {documentId && (
            <button
              type="button"
              onClick={() => {
                addBookmark(documentId, section, `Закладка · глава ${section}`);
                setBookmarkFlash(true);
                window.setTimeout(() => setBookmarkFlash(false), 1200);
                window.dispatchEvent(new CustomEvent("blabla:bookmarks-changed", { detail: { documentId } }));
              }}
              className={`icon-button ${bookmarkFlash ? "border-rust bg-rust text-white" : ""}`}
              aria-label="Поставить закладку на эту главу"
              title="Закладка на эту главу"
            >
              <Bookmark size={14} />
            </button>
          )}
          {documentId && currentUserId && canAnnotate && (
            <>
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
            </>
          )}
        </div>
      </div>

      {tocOpen && toc.length > 0 && (
        <div className="mb-3 max-h-48 overflow-y-auto rounded-xl border border-ink/10 bg-paper p-2">
          <p className="mb-1 px-2 font-mono text-[10px] uppercase tracking-widest text-muted">
            Оглавление — выберите главу
          </p>
          <ul className="columns-1 gap-x-4 sm:columns-2">
            {toc.map((item, i) => (
              <li key={`${item.href}-${i}`} className="break-inside-avoid">
                <button
                  type="button"
                  className="w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-ink/[0.04]"
                  onClick={() => {
                    renditionRef.current?.display(item.href);
                    setTocOpen(false);
                  }}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {stubWarning && (
        <p className="mb-3 rounded-lg border border-rust/25 bg-rust/10 px-3 py-2 text-xs leading-5 text-rust">
          Похоже, в этом EPUB почти нет сплошного текста — только оглавление со ссылками
          (часто так устроены «пустые» файлы с Gutenberg). Откройте оглавление слева или
          скачайте книгу: если есть TXT/другая редакция, в ней текст обычно полный.
        </p>
      )}
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
        {!placing && !drawMode && (
          <>
            <button
              type="button"
              onClick={() => renditionRef.current?.prev()}
              aria-label="Предыдущая страница"
              className="group absolute inset-y-0 left-0 z-30 hidden w-14 items-center justify-start md:flex"
            >
              <span className="ml-1 grid size-11 place-items-center rounded-full border border-ink/10 bg-paper/90 text-muted opacity-0 shadow-sm transition-all group-hover:opacity-100 group-hover:border-ink/20 group-hover:text-ink">
                <ChevronLeft size={20} />
              </span>
            </button>
            <button
              type="button"
              onClick={() => renditionRef.current?.next()}
              aria-label="Следующая страница"
              className="group absolute inset-y-0 right-0 z-30 hidden w-14 items-center justify-end md:flex"
            >
              <span className="mr-1 grid size-11 place-items-center rounded-full border border-ink/10 bg-paper/90 text-muted opacity-0 shadow-sm transition-all group-hover:opacity-100 group-hover:border-ink/20 group-hover:text-ink">
                <ChevronRight size={20} />
              </span>
            </button>
          </>
        )}
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
            onUpdate={updateAnnotation}
            onReply={onReplyToAnnotation ?? (() => {})}
            onReport={onReport ?? (() => {})}
            onPlaced={() => setPlacing(false)}
            pageDraw={pageDrawSession}
            screenKey={screenKey}
            hidden={!showAnnotations}
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
