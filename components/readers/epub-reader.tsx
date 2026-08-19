"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bookmark, ChevronLeft, ChevronRight, Eye, EyeOff, List, Loader2, MapPin, PenTool, Search } from "lucide-react";
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
import { ReaderSearchPanel } from "./reader-search-panel";
import { ReaderToc } from "./reader-toc";
import { SelectionLookup } from "./selection-lookup";
import { ZoomControls } from "./zoom-controls";
import { addBookmark } from "@/lib/bookmarks";
import { displayCandidates, gutenbergIdFromHref, isExternalHttp, isIgnorableHref } from "@/lib/epub-links";
import { pickReadableEpubHref, resolveEpubSpineHref } from "@/lib/epub-spine";
import { buildSearchExcerpt } from "@/lib/reader-search";
import { isTypingTarget } from "@/lib/reader-keys";

type TocItem = { label: string; href: string; kind?: "contents" };
type EpubSearchSection = {
  href?: string;
  load?: (request: (target: string) => Promise<unknown>) => Promise<unknown>;
  find?: (query: string) => { excerpt?: string }[];
  unload?: () => void;
};
type EpubSearchBook = {
  load: (target: string) => Promise<unknown>;
  path?: { relative?: (href: string) => string };
  resolve?: (href: string, absolute?: boolean) => string;
  spine: {
    length?: number;
    get: (target: string | number) => EpubSearchSection | null;
  };
};
type EpubBookWithSpine = {
  spine: {
    length?: number;
    get: (target: string | number) => { href?: string } | null;
  };
};
type EpubSearchResult = {
  id: string;
  label: string;
  hint?: string;
  excerpt?: string;
  href: string;
  section: number;
  active?: boolean;
};
const EPUB_ZOOM_KEY = "reader:epub-zoom";
function normalizeEpubTocLabel(label: string) {
  return label.replace(/\s+/g, " ").trim();
}

function isEpubTocEntry(label: string) {
  const text = normalizeEpubTocLabel(label);
  if (!text || text.length < 2 || text.length > 90) return false;
  if (/^(?:contents|table of contents|оглавление|содержание)$/i.test(text)) return false;
  if (/project gutenberg|transcriber|copyright|illustration|cover|title page|frontispiece/i.test(text)) {
    return false;
  }
  if (/^(?:by\s|translated by|bishop of hippo|ad\s+\d{2,4}\b)/i.test(text)) return false;
  const entryLike =
    /^(?:book|chapter|canto|part|section|preface|appendix|lecture|lectio|книга|глава|часть)\b/i.test(text) ||
    /^(?:[ivxlcdm]{1,8}|\d{1,3}|[α-ω]{1,6})[.:)]?(?:\s+\S|$)/i.test(text);
  const mostlyCaps =
    text === text.toUpperCase() &&
    /[A-ZΑ-ΩА-ЯЁ]/.test(text) &&
    text.split(/\s+/).length <= 4;
  if (mostlyCaps && !entryLike) return false;
  return true;
}

function dedupeEpubToc(items: TocItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.href}::${normalizeEpubTocLabel(item.label).toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

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
  onAnnotationsChange,
  companionTarget,
  onOpenLinkedCompanion,
  onMirrorAnnotationCreated,
  compact = false,
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
  const rootRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<import("epubjs").Rendition | null>(null);
  const bookRef = useRef<EpubSearchBook | null>(null);
  const sectionRef = useRef(1);
  const screenKeyRef = useRef("1:1");
  const locationTargetRef = useRef<string | null>(null);
  const documentIdRef = useRef(documentId);
  documentIdRef.current = documentId;
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
  const [linkNote, setLinkNote] = useState<string | null>(null);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [bookmarkFlash, setBookmarkFlash] = useState(false);
  const [stubWarning, setStubWarning] = useState(false);
  const [zoom, setZoom] = useState(1);
  const searchRunRef = useRef(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<EpubSearchResult[]>([]);
  const followHrefRef = useRef<(href: string) => Promise<void>>(async () => {});
  const tocRef = useRef<TocItem[]>([]);
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
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    setStubWarning(false);
  }, [url]);

  useEffect(() => {
    onAnnotationsChange?.(annotations);
  }, [annotations, onAnnotationsChange]);

  useEffect(() => {
    tocRef.current = toc;
  }, [toc]);

  useEffect(() => {
    setSearchResults((current) =>
      current.map((item) =>
        item.active === (item.section === section)
          ? item
          : { ...item, active: item.section === section },
      ),
    );
  }, [section]);

  useEffect(() => {
    const stored = Number.parseFloat(window.localStorage.getItem(EPUB_ZOOM_KEY) ?? "");
    if (Number.isFinite(stored)) {
      setZoom(Math.min(1.6, Math.max(0.9, stored)));
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(EPUB_ZOOM_KEY, String(zoom));
  }, [zoom]);

  const syncRenditionLayout = useCallback(() => {
    const rendition = renditionRef.current;
    const wrap = wrapRef.current;
    if (!rendition || !wrap) return;
    try {
      rendition.resize(wrap.clientWidth, wrap.clientHeight);
    } catch {
      /* ignore transient epub.js layout failures */
    }
  }, []);

  const sectionNumberForHref = useCallback((href: string | null | undefined, book?: EpubBookWithSpine | null) => {
    if (!href) return null;
    const baseHref = href.split("#")[0] ?? href;
    const resolvedBase = book ? resolveEpubSpineHref(book.spine, baseHref) ?? baseHref : baseHref;
    const needle = (resolvedBase.split("#")[0] ?? resolvedBase).trim();
    const needleFile = needle.split("/").pop() ?? needle;
    for (let index = 0; index < tocRef.current.length; index += 1) {
      const item = tocRef.current[index];
      const tocBaseRaw = book ? resolveEpubSpineHref(book.spine, item.href) ?? item.href : item.href;
      const tocBase = (tocBaseRaw.split("#")[0] ?? tocBaseRaw).trim();
      const tocFile = tocBase.split("/").pop() ?? tocBase;
      if (tocBase === needle || tocFile === needleFile) {
        return index + 1;
      }
    }
    return null;
  }, []);

  const goToSection = useCallback((target: number) => {
    const rendition = renditionRef.current;
    const book = bookRef.current;
    if (!rendition || !book) return;
    const spine = rendition.book.spine as unknown as {
      length?: number;
      get: (target: number) => { href?: string } | null;
    };
    const maxSection = tocRef.current.length || spine.length || totalSections || target || 1;
    const clamped = Math.max(1, Math.min(maxSection, target));
    const tocTargetHref = tocRef.current[clamped - 1]?.href ?? null;
    if (tocTargetHref) {
      sectionRef.current = clamped;
      locationTargetRef.current = tocTargetHref;
      void followHrefRef.current(tocTargetHref);
      return;
    }
    const targetHref = spine.get(clamped - 1)?.href ?? book.spine.get(clamped - 1)?.href ?? null;
    if (!targetHref) return;
    sectionRef.current = clamped;
    locationTargetRef.current = targetHref;
    void rendition.display(targetHref).then(() => {
      window.requestAnimationFrame(() => syncRenditionLayout());
    }).catch(() => {
      /* ignore broken target */
    });
  }, [syncRenditionLayout, totalSections]);

  const stepSection = useCallback((delta: number) => {
    goToSection(sectionRef.current + (delta >= 0 ? 1 : -1));
  }, [goToSection]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      if (event.key === "ArrowRight") stepSection(1);
      if (event.key === "ArrowLeft") stepSection(-1);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [stepSection]);

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
        bookRef.current = book as unknown as EpubSearchBook;
        const rendition = book.renderTo(containerRef.current, {
          width: "100%",
          height: "100%",
          flow: "paginated",
          allowScriptedContent: false,
        });
        renditionRef.current = rendition;
        rendition.flow("paginated");
        rendition.spread("none");
        rendition.themes.fontSize(`${Math.round(zoom * 100)}%`);

        function spineOf() {
          return rendition.book.spine as unknown as {
            length?: number;
            get: (target: string | number) => { href?: string } | null;
          };
        }

        function restoreSpine() {
          const target =
            locationTargetRef.current ??
            spineOf().get(Math.max(0, sectionRef.current - 1))?.href ??
            null;
          if (!target) return;
          if (typeof target === "string" && target.includes("#")) {
            void followHrefRef.current(target);
            return;
          }
          void rendition.display(target);
        }

        function guardIframes() {
          const root = containerRef.current;
          if (!root) return;
          for (const iframe of Array.from(root.querySelectorAll("iframe"))) {
            if (iframe.dataset.blablaGuard === "1") continue;
            iframe.dataset.blablaGuard = "1";
            iframe.addEventListener("load", () => {
              try {
                const loc = iframe.contentWindow?.location.href ?? "";
                if (!loc || loc === "about:blank" || loc.startsWith("blob:")) return;
                const url = new URL(loc, window.location.href);
                const path = url.pathname;
                if (path.startsWith("/uploads/") || path.startsWith("/_next/static/")) return;
                const fallbackFile = path.split("/").filter(Boolean).pop() ?? "";
                if (fallbackFile && !path.startsWith("/documents/")) {
                  void followHrefRef.current(`${fallbackFile}${url.hash}`);
                  return;
                }
                restoreSpine();
              } catch {
                /* blob / opaque */
              }
            });
          }
        }

        function syncSelectionDoc() {
          const contentsList = rendition.getContents() as unknown as { document: Document }[];
          setSelectionDoc(contentsList[0]?.document ?? null);
        }

        function scrollToVisibleAnchor(href: string) {
          const hashIndex = href.indexOf("#");
          const hash = href.startsWith("#") ? href.slice(1) : hashIndex >= 0 ? href.slice(hashIndex + 1) : "";
          if (!hash) return false;
          const id = decodeURIComponent(hash);
          const contents = rendition.getContents() as unknown as { document?: Document }[] | { document?: Document };
          const docs = Array.isArray(contents) ? contents : contents ? [contents] : [];
          for (const item of docs) {
            const doc = item.document;
            if (!doc) continue;
            const el =
              doc.getElementById(id) ||
              doc.querySelector(`[name="${CSS.escape(id)}"]`);
            if (el) {
              el.scrollIntoView({ block: "start" });
              return true;
            }
          }
          return false;
        }

        function getRenderedContents() {
          const contents = rendition.getContents() as unknown as
            | { document?: Document; cfiFromNode?: (node: Node, ignoreClass?: string) => string }[]
            | { document?: Document; cfiFromNode?: (node: Node, ignoreClass?: string) => string };
          return Array.isArray(contents) ? contents : contents ? [contents] : [];
        }

        function waitForLayout() {
          return new Promise<void>((resolve) => {
            window.requestAnimationFrame(() => {
              window.requestAnimationFrame(() => resolve());
            });
          });
        }

        function findAnchorTarget(href: string) {
          const hashIndex = href.indexOf("#");
          const rawHash = href.startsWith("#") ? href.slice(1) : hashIndex >= 0 ? href.slice(hashIndex + 1) : "";
          if (!rawHash) return null;
          const id = decodeURIComponent(rawHash);
          for (const item of getRenderedContents()) {
            const doc = item.document;
            if (!doc) continue;
            const el = doc.getElementById(id) || doc.querySelector(`[name="${CSS.escape(id)}"]`);
            if (el) return { item, el };
          }
          return null;
        }

        async function snapToAnchor(href: string) {
          const target = findAnchorTarget(href);
          if (!target) return false;
          try {
            target.el.scrollIntoView({ block: "start", inline: "nearest" });
            return true;
          } catch {
            return false;
          }
        }

        async function displayInternal(href: string) {
          const target = href.trim();
          if (!target) return false;
          const toRelative = (value: string) => {
            const trimmed = value.trim();
            if (!trimmed) return trimmed;
            if (trimmed.startsWith("#")) {
              const currentHref = spineOf().get(Math.max(0, sectionRef.current - 1))?.href ?? "";
              return currentHref ? `${currentHref.split("#")[0] ?? currentHref}${trimmed}` : trimmed;
            }
            try {
              return (book.path?.relative?.(trimmed) ?? trimmed).trim();
            } catch {
              return trimmed;
            }
          };
          const normalized = toRelative(target);
          const resolved = resolveEpubSpineHref(book.spine, normalized) ?? normalized;
          const candidates = displayCandidates(resolved);
          if (target.startsWith("#")) {
            const currentHref = spineOf().get(Math.max(0, sectionRef.current - 1))?.href ?? "";
            if (currentHref) {
              const anchored = `${currentHref.split("#")[0] ?? currentHref}${target}`;
              const anchoredResolved = resolveEpubSpineHref(book.spine, anchored) ?? anchored;
              candidates.push(...displayCandidates(anchoredResolved));
            }
          }
          for (const candidate of [...new Set(candidates.filter(Boolean))]) {
            try {
              const displayTarget = candidate.includes("#") ? (candidate.split("#")[0] ?? candidate) : candidate;
              locationTargetRef.current = candidate;
              await rendition.display(displayTarget);
              if (candidate.includes("#") || resolved.includes("#") || target.includes("#")) {
                await waitForLayout();
                if (await snapToAnchor(candidate)) return true;
                if (candidate !== resolved && (await snapToAnchor(resolved))) return true;
                if (resolved !== target && (await snapToAnchor(target))) return true;
              }
              return true;
            } catch {
              /* try next normalized target */
            }
          }
          const base = resolved.split("#")[0] ?? resolved;
          if (base && base !== resolved) {
            try {
              locationTargetRef.current = base;
              await rendition.display(base);
              await waitForLayout();
              if (await snapToAnchor(resolved)) return true;
              if (resolved !== target && (await snapToAnchor(target))) return true;
            } catch {
              /* ignore final anchor fallback */
            }
          }
          if (scrollToVisibleAnchor(resolved)) return true;
          if (resolved !== target && scrollToVisibleAnchor(target)) return true;
          return false;
        }

        async function followHref(raw: string) {
          const href = raw.trim();
          if (!href || isIgnorableHref(href)) return;
          setLinkNote(null);
          const hash = href.includes("#") ? href.slice(href.indexOf("#")) : "";

          const gutenbergId = gutenbergIdFromHref(href);
          if (gutenbergId) {
            try {
              const response = await fetch(`/api/catalog/gutenberg/${gutenbergId}`);
              if (response.ok) {
                const found = (await response.json()) as { documentId: string; title: string };
                if (found.documentId === documentIdRef.current) {
                  if (await displayInternal(href)) return;
                  if (hash && (await displayInternal(hash))) return;
                  return;
                }
                const target = window.top ?? window;
                target.location.assign(`/documents/${found.documentId}`);
                return;
              }
            } catch {
              /* stay in the book */
            }
            if (await displayInternal(href)) return;
            if (hash && (await displayInternal(hash))) return;
            setLinkNote("Этой книги нет в каталоге — ссылка никуда не ведёт, остаёмся в текущем тексте.");
            return;
          }

          if (isExternalHttp(href)) {
            if (hash && (await displayInternal(hash))) return;
            setLinkNote("Внешние ссылки из EPUB не открываем, чтобы не уходить со страницы.");
            return;
          }

          if (href.startsWith("/documents/")) {
            const target = window.top ?? window;
            target.location.assign(href);
            return;
          }

          const ok = await displayInternal(href);
          if (ok) return;
          if (hash && (await displayInternal(hash))) return;
          setLinkNote("Эта ссылка внутри файла никуда не ведёт.");
        }
        followHrefRef.current = followHref;

        rendition.hooks.content.register((contents: {
          document: Document;
          on?: (event: string, listener: (href: string) => void) => void;
        }) => {
          try {
            contents.document.documentElement.style.height = "100%";
            contents.document.documentElement.style.width = "100%";
            contents.document.documentElement.style.maxWidth = "100%";
            contents.document.documentElement.style.overflow = "hidden";
            contents.document.documentElement.style.overflowX = "hidden";
            contents.document.body.style.height = "100%";
            contents.document.body.style.minHeight = "100%";
            contents.document.body.style.width = "100%";
            contents.document.body.style.maxWidth = "100%";
            contents.document.body.style.margin = "0";
            contents.document.body.style.padding = "0 1rem";
            contents.document.body.style.overflow = "hidden";
            contents.document.body.style.overflowX = "hidden";
            contents.document.body.style.boxSizing = "border-box";
            contents.document.body.style.wordBreak = "break-word";
            for (const element of Array.from(contents.document.querySelectorAll("img, svg, video, canvas, table, pre"))) {
              const node = element as HTMLElement;
              node.style.maxWidth = "100%";
              node.style.boxSizing = "border-box";
              if (
                node instanceof HTMLImageElement ||
                node instanceof HTMLVideoElement ||
                node instanceof HTMLCanvasElement ||
                node instanceof SVGElement
              ) {
                node.style.height = "auto";
              }
            }
          } catch {
            /* ignore */
          }
          contents.on?.("linkClicked", (href: string) => {
            void followHref(href);
          });
          const interceptAnchor = (anchor: HTMLAnchorElement) => {
            if (anchor.dataset.blablaLink === "1") return;
            anchor.dataset.blablaLink = "1";
            anchor.target = "_self";
            const originalHref = anchor.getAttribute("href")?.trim() ?? "";
            if (originalHref) {
              anchor.dataset.blablaHref = originalHref;
              anchor.setAttribute("href", "#");
            }
            const handleAnchor = (event: Event) => {
              const href = anchor.dataset.blablaHref?.trim() ?? "";
              if (!href || isIgnorableHref(href)) return;
              event.preventDefault();
              event.stopPropagation();
              if ("stopImmediatePropagation" in event) {
                event.stopImmediatePropagation();
              }
              void followHref(href);
            };
            anchor.addEventListener("click", handleAnchor, true);
            anchor.addEventListener("auxclick", handleAnchor, true);
          };
          for (const anchor of Array.from(contents.document.querySelectorAll("a[href]"))) {
            interceptAnchor(anchor as HTMLAnchorElement);
          }
          const anchorFromTarget = (target: EventTarget | null) => {
            let node = target instanceof Node ? target : null;
            while (node) {
              if (node instanceof HTMLAnchorElement && node.hasAttribute("href")) return node;
              node = node.parentNode;
            }
            return null;
          };
          const onClick = (event: MouseEvent) => {
            const anchor = anchorFromTarget(event.target);
            if (!anchor) return;
            const href = anchor.dataset.blablaHref?.trim() ?? anchor.getAttribute("href")?.trim() ?? "";
            if (!href || isIgnorableHref(href)) return;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            void followHref(href);
          };
          contents.document.addEventListener("click", onClick, true);
        });

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
            locationTargetRef.current =
              spineOf().get(Math.max(0, index - 1))?.href ??
              location.start.cfi ??
              null;
            const tocNumber = sectionNumberForHref(locationTargetRef.current, book);
            const displayIndex = tocNumber ?? index;
            const displayTotal = tocRef.current.length || total;
            setSection(displayIndex);
            setScreenKey(nextScreenKey);
            setTotalSections(displayTotal);
            onPageChange(displayIndex, displayTotal);
            syncSelectionDoc();
          },
        );

        // Keep in-book TOC / chapter hyperlinks inside the reader and sync the
        // section counter (epub.js already calls display(); we just mirror state).
        rendition.on("rendered", () => {
          syncSelectionDoc();
          guardIframes();
        });

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

          const spine = book.spine as unknown as {
            length?: number;
            get: (index: number) => { href?: string } | null;
          };
          let contentsHref =
            flat.find((item) => /contents|оглавление|содержание|toc\b/i.test(item.label))?.href ?? null;
          if (!contentsHref) {
            for (let i = 0; i < Math.min(spine.length ?? 0, 12); i += 1) {
              const href = spine.get(i)?.href ?? "";
              if (/toc|nav|contents|oglav/i.test(href)) {
                contentsHref = href;
                break;
              }
            }
          }
          if (contentsHref && !flat.some((item) => item.kind === "contents")) {
            flat.unshift({ label: "Страница оглавления", href: contentsHref, kind: "contents" });
          }
          const navEntries = flat.filter(
            (item) =>
              item.kind === "contents" ||
              (Boolean(item.href) && isEpubTocEntry(item.label)),
          );
          const preferredEntries = navEntries.filter((item) => item.kind !== "contents");
          const cleaned = dedupeEpubToc([
            ...navEntries.filter((item) => item.kind === "contents"),
            ...preferredEntries,
          ]);
          const preferredHrefs = preferredEntries.map((item) => item.href);
          if (!cancelled) {
            setToc(cleaned);
            setTocOpen(false);
          }

          const initialHref =
            cleaned[Math.max(0, page - 1)]?.href ??
            pickReadableEpubHref(book.spine, preferredHrefs, page) ??
            undefined;
          locationTargetRef.current = initialHref ?? null;
          if (initialHref) {
            const opened = await displayInternal(initialHref);
            if (!opened) await rendition.display(initialHref);
          } else {
            await rendition.display(initialHref);
          }
          syncRenditionLayout();

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
          const initialHref =
            tocRef.current[Math.max(0, page - 1)]?.href ??
            pickReadableEpubHref(book.spine, [], page) ??
            undefined;
          locationTargetRef.current = initialHref ?? null;
          if (initialHref) {
            const opened = await displayInternal(initialHref);
            if (!opened) await rendition.display(initialHref);
          } else {
            await rendition.display(initialHref);
          }
          syncRenditionLayout();
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
      bookRef.current = null;
      renditionRef.current?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      syncRenditionLayout();
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [syncRenditionLayout, url]);

  // Lets the outer "Пометки на страницах" index jump straight to a section —
  // only acts when the target actually differs from where we already are,
  // so it doesn't fight with `relocated` echoing the same section back.
  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition || !page || page === sectionRef.current) return;
    goToSection(page);
  }, [goToSection, page]);

  useEffect(() => {
    renditionRef.current?.themes.fontSize(`${Math.round(zoom * 100)}%`);
    window.requestAnimationFrame(() => syncRenditionLayout());
  }, [syncRenditionLayout, zoom]);

  async function runSearch() {
    const needle = searchQuery.trim();
    const book = bookRef.current;
    if (needle.length < 2 || !book) {
      setSearchResults([]);
      return;
    }
    const searchId = ++searchRunRef.current;
    setSearchLoading(true);
    try {
      const results: EpubSearchResult[] = [];
      const maxResults = 28;
      const spine = book.spine;
      const total = spine.length ?? 0;
      for (let index = 0; index < total; index += 1) {
        if (searchId !== searchRunRef.current) return;
        const section = spine.get(index);
        if (!section?.href || !section.load || !section.find) continue;
        try {
          await section.load(book.load.bind(book));
          const match = section.find(needle)[0];
          if (match) {
            const baseHref = section.href.split("#")[0] ?? section.href;
            const tocLabel =
              toc.find((item) => {
                const tocBase = item.href.split("#")[0] ?? item.href;
                return tocBase === baseHref || tocBase.endsWith(`/${baseHref.split("/").pop() ?? ""}`);
              })?.label ?? `Глава ${index + 1}`;
            results.push({
              id: `${section.href}-${index}`,
              href: section.href,
              section: index + 1,
              label: tocLabel,
              hint: `глава ${index + 1}`,
              excerpt: buildSearchExcerpt(match.excerpt ?? "", needle),
              active: index + 1 === sectionRef.current,
            });
          }
        } catch {
          /* broken section, skip */
        } finally {
          section.unload?.();
        }
        if (results.length >= maxResults) break;
      }
      if (searchId !== searchRunRef.current) return;
      setSearchResults(results);
    } finally {
      if (searchId === searchRunRef.current) setSearchLoading(false);
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
  }, [searchOpen, searchQuery, toc]);

  async function createAnnotation(draft: AnnotationDraft) {
    if (!documentId) return;
    const response = await fetch("/api/annotations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId, ...draft }),
    });
    if (!response.ok) return;
    const { id, mirror } = (await response.json()) as { id: string; mirror?: AnnotationItem };
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
          ? "overflow-hidden rounded-2xl border border-ink/10 bg-ink/[0.02] p-2 md:p-2.5"
          : compact
            ? "overflow-hidden rounded-2xl border border-ink/10 bg-ink/[0.02] p-3 md:p-4"
            : "overflow-hidden rounded-2xl border border-ink/10 bg-ink/[0.02] p-4 md:p-6"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3 pb-3 md:pb-4">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => stepSection(-1)} className="icon-button" aria-label="Предыдущая страница">
            <ChevronLeft size={16} />
          </button>
          <PageJumpInput
            page={section}
            total={totalSections}
            label="глава"
            compact={compact}
            display={totalSections ? `глава ${section} / ${totalSections}` : "EPUB"}
            onJump={(target) => goToSection(target)}
          />
          <button type="button" onClick={() => stepSection(1)} className="icon-button" aria-label="Следующая страница">
            <ChevronRight size={16} />
          </button>
          {!loading && (
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
          {!loading && (
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
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <ZoomControls value={zoom} min={0.9} max={1.6} onChange={setZoom} compact={compact} />
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

      <ReaderSearchPanel
        open={searchOpen}
        query={searchQuery}
        loading={searchLoading}
        results={searchResults}
        placeholder="Найти слово или фразу в EPUB…"
        empty="В этом EPUB совпадений не нашлось."
        countLabel={
          searchResults.length
            ? `Совпадений: ${searchResults.length}${searchResults.length >= 28 ? "+" : ""}`
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
          void followHrefRef.current(item.href);
        }}
        onClose={() => setSearchOpen(false)}
      />

      {linkNote && (
        <p className="mb-3 rounded-lg border border-ink/10 bg-ink/[0.03] px-3 py-2 text-xs leading-5 text-muted">
          {linkNote}
        </p>
      )}
      {stubWarning && (
        <p className="mb-3 rounded-lg border border-rust/25 bg-rust/10 px-3 py-2 text-xs leading-5 text-rust">
          Похоже, в этом EPUB почти нет сплошного текста — только оглавление со ссылками
          (часто так устроены «пустые» файлы с Gutenberg). Ссылки из книги остаются
          внутри читалки: главы открываются здесь, чужие сайты не открываем. Если есть
          TXT или другое издание в каталоге — откройте его рядом.
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

      <div className="relative">
        <ReaderToc
          open={tocOpen && !loading}
          items={toc.map((item, i) => ({
            id: `${item.href}-${i}`,
            label: item.label,
            kind: item.kind,
          }))}
          empty="В этом EPUB нет навигации по главам."
          onClose={() => setTocOpen(false)}
          onSelect={(id) => {
            const item = toc.find((entry, i) => `${entry.href}-${i}` === id);
            const href = item?.href;
            if (!href) return;
            setTocOpen(false);
            void followHrefRef.current(href);
          }}
        />
        <div
          ref={wrapRef}
          className="relative min-w-0 flex-1 overflow-hidden rounded-xl bg-paper"
          style={{ height, minHeight: 240 }}
        >
          {loading && (
            <div className="absolute inset-0 z-10 grid place-items-center">
              <Loader2 className="animate-spin text-muted" />
            </div>
          )}
          <div ref={containerRef} className="h-full w-full overflow-hidden" />
          {!placing && !drawMode && (
            <>
              <button
                type="button"
                onClick={() => stepSection(-1)}
                aria-label="Предыдущая страница"
                className="group absolute inset-y-0 left-0 z-30 hidden w-14 items-center justify-start md:flex"
              >
                <span className="ml-1 grid size-11 place-items-center rounded-full border border-ink/10 bg-paper/90 text-muted opacity-0 shadow-sm transition-all group-hover:opacity-100 group-hover:border-ink/20 group-hover:text-ink">
                  <ChevronLeft size={20} />
                </span>
              </button>
              <button
                type="button"
                onClick={() => stepSection(1)}
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
              companionTarget={companionTarget}
              onOpenLinkedCompanion={onOpenLinkedCompanion}
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
    </div>
  );
}
