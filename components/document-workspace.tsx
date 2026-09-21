"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Bookmark,
  ChevronDown,
  ChevronRight,
  Maximize2,
  MessageSquare,
  Minimize2,
  Send,
  Trash2,
} from "lucide-react";
import { ChatMessage } from "@/components/chat-message";
import { CompanionPicker } from "@/components/companion-picker";
import { MarksDock, type MarksPlacement } from "@/components/marks-dock";
import type { AnnotationItem } from "@/components/readers/annotation-layer";
import { ReportDialog } from "@/components/report-dialog";
import {
  loadBookmarks,
  removeBookmark,
  type ReaderBookmark,
} from "@/lib/bookmarks";
import { ShareWithFriends } from "@/components/share-with-friends";
import {
  loadReadingProgress,
  pruneReadingProgress,
  saveReadingProgress,
  type ReadingProgressKind,
} from "@/lib/reading-progress";
import { canAnnotateFiles } from "@/lib/roles";
import type { CompanionSuggestions } from "@/lib/db/companion-suggestions";

const PdfReader = dynamic(
  () => import("@/components/readers/pdf-reader").then((m) => m.PdfReader),
  { ssr: false },
);
const EpubReader = dynamic(
  () => import("@/components/readers/epub-reader").then((m) => m.EpubReader),
  { ssr: false },
);
const TxtReader = dynamic(
  () => import("@/components/readers/txt-reader").then((m) => m.TxtReader),
  { ssr: false },
);

export type CommentItem = {
  id: string;
  parentId: string | null;
  annotationId: string | null;
  page: number | null;
  body: string;
  createdAt: string;
  updatedAt?: string | null;
  authorId: string;
  authorName: string;
  authorRole?: string | null;
  authorAvatarKey?: string | null;
  authorAvatarColor?: string | null;
};

type CurrentUser = {
  id: string;
  name: string;
  role: string;
  avatarKey?: string | null;
  avatarColor?: string | null;
} | null;

export type CompanionEdition = {
  id: string;
  title: string;
  roleLabel: string;
  language: string | null;
};

function buildDiscussionShareUrl(page?: number | null, hash?: string) {
  if (typeof window === "undefined") return "/";
  const url = new URL(window.location.href);
  if (page != null && page >= 1) {
    url.searchParams.set("page", String(page));
  }
  if (hash) {
    url.hash = hash;
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function DocumentWorkspace({
  documentId,
  documentTitle,
  documentAuthors,
  catalogHref,
  fileUrl,
  fileType,
  comments,
  annotations,
  currentUser,
  language,
  onShelf = false,
  initialCloudPage = null,
  embed = false,
  editions = [],
  companionId = null,
  companionTitle = null,
  initialCompanionPage = null,
  suggestions = { dictionaries: [], references: [], sameAuthor: [], sameSection: [], staffPicks: [] },
  sharedQuote = null,
}: {
  documentId: string;
  documentTitle?: string;
  documentAuthors?: string;
  catalogHref?: string | null;
  fileUrl: string | null;
  fileType: string;
  comments: CommentItem[];
  annotations: AnnotationItem[];
  currentUser: CurrentUser;
  /** Primary language of the book — used by the selection dictionary. */
  language?: string | null;
  /** When true, rare cloud sync of progress is allowed (shelf-only). */
  onShelf?: boolean;
  initialCloudPage?: number | null;
  /** Reader-only pane for parallel viewing (no comments, no chrome). */
  embed?: boolean;
  editions?: CompanionEdition[];
  companionId?: string | null;
  companionTitle?: string | null;
  initialCompanionPage?: number | null;
  suggestions?: CompanionSuggestions;
  sharedQuote?: string | null;
}) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [progressReady, setProgressReady] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [reportTarget, setReportTarget] = useState<{
    type: "annotation" | "comment";
    id: string;
  } | null>(null);
  const lastCloudSync = useRef(0);
  const isPdf = fileType === "PDF";
  const isEpub = fileType === "EPUB";
  const isTxt = fileType === "TXT";
  const pageLabel = isEpub ? "глава" : isTxt ? "лист" : "стр.";
  const canFullscreen = Boolean(fileUrl) && (isPdf || isEpub || isTxt);
  const canAnnotate = canAnnotateFiles(currentUser?.role);
  const otherEditions = editions.filter((item) => item.id !== documentId);
  const [liveAnnotations, setLiveAnnotations] = useState(annotations);
  const [marksPlace, setMarksPlace] = useState<MarksPlacement>("hidden");
  const companionFrameRef = useRef<HTMLIFrameElement | null>(null);
  const pendingCompanionJumpRef = useRef<number | null>(initialCompanionPage);
  const [companionPage, setCompanionPage] = useState<number | null>(initialCompanionPage);
  const [companionPageLabel, setCompanionPageLabel] = useState("стр.");
  const [liveCompanionTitle, setLiveCompanionTitle] = useState<string | null>(companionTitle);
  const readerHostRef = useRef<HTMLDivElement | null>(null);

  const appendLiveAnnotation = useCallback((item: AnnotationItem) => {
    setLiveAnnotations((current) => (current.some((existing) => existing.id === item.id) ? current : [...current, item]));
  }, []);

  useEffect(() => {
    setLiveAnnotations(annotations);
  }, [annotations]);

  useEffect(() => {
    if (liveAnnotations.length === 0 && marksPlace !== "hidden") {
      setMarksPlace("hidden");
    }
  }, [liveAnnotations.length, marksPlace]);

  useEffect(() => {
    setCompanionPage(initialCompanionPage);
    setCompanionPageLabel("стр.");
    setLiveCompanionTitle(companionTitle);
    pendingCompanionJumpRef.current = initialCompanionPage;
  }, [companionId, companionTitle, initialCompanionPage]);

  const scrollReaderIntoView = useCallback((behavior: ScrollBehavior = "smooth") => {
    readerHostRef.current?.scrollIntoView({ block: "start", behavior });
  }, []);

  function setCompanion(nextId: string, nextPage?: number | null) {
    const url = new URL(window.location.href);
    if (nextId) {
      url.searchParams.set("with", nextId);
      if (nextPage && nextPage >= 1) {
        url.searchParams.set("withPage", String(nextPage));
      } else {
        url.searchParams.delete("withPage");
      }
    } else {
      url.searchParams.delete("with");
      url.searchParams.delete("withPage");
    }
    router.push(`${url.pathname}${url.search}`);
  }

  const progressKind: ReadingProgressKind | null = isPdf
    ? "pdf"
    : isEpub
      ? "epub"
      : isTxt
        ? "txt"
        : null;

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("page");
    const fromUrl = raw ? Number.parseInt(raw, 10) : NaN;
    if (Number.isFinite(fromUrl) && fromUrl >= 1) {
      setPage(fromUrl);
      setProgressReady(true);
      return;
    }

    const local = loadReadingProgress(documentId);
    let next = 1;
    if (local && (!progressKind || local.kind === progressKind)) {
      next = local.page;
    } else if (typeof initialCloudPage === "number" && initialCloudPage >= 1) {
      // Cloud only when this browser has no local bookmark (cross-device / new device).
      next = initialCloudPage;
    }
    setPage(next);
    setProgressReady(true);
    pruneReadingProgress(documentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  const syncCloud = useCallback((nextPage: number, total?: number) => {
    if (!currentUser || !onShelf || !progressKind) return;
    const now = Date.now();
    if (now - lastCloudSync.current < 60_000) return;
    lastCloudSync.current = now;
    void fetch(`/api/reading-progress/${documentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: nextPage, total, kind: progressKind }),
      keepalive: true,
    });
  }, [currentUser, documentId, onShelf, progressKind]);

  const persistPosition = useCallback((nextPage: number, total?: number) => {
    if (!progressKind) return;
    saveReadingProgress(documentId, {
      kind: progressKind,
      page: nextPage,
      total,
    });
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("page", String(nextPage));
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* ignore */
    }
    syncCloud(nextPage, total);
  }, [documentId, progressKind, syncCloud]);

  useEffect(() => {
    function flush() {
      if (!progressKind || !progressReady) return;
      saveReadingProgress(documentId, {
        kind: progressKind,
        page,
        total: numPages || undefined,
      });
      if (currentUser && onShelf) {
        lastCloudSync.current = 0;
        syncCloud(page, numPages || undefined);
      }
    }
    function onVis() {
      if (document.visibilityState === "hidden") flush();
    }
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, page, numPages, progressKind, progressReady, onShelf, currentUser?.id]);

  useEffect(() => {
    if (!fullscreen) return;
    document.body.style.overflow = "hidden";
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setFullscreen(false);
    }
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKey);
    };
  }, [fullscreen]);

  async function replyToAnnotation(annotationId: string, body: string) {
    await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId, body, annotationId }),
    });
    router.refresh();
  }

  const handlePageChange = useCallback((next: number, total: number) => {
    setPage(next);
    setNumPages(total);
    persistPosition(next, total);
  }, [persistPosition]);

  function jumpToReaderPage(target: number, scrollToReader = false) {
    handlePageChange(target, numPages || target);
    if (scrollToReader) {
      scrollReaderIntoView();
    }
  }

  useEffect(() => {
    if (!sharedQuote || embed) return;
    window.requestAnimationFrame(() => {
      scrollReaderIntoView("auto");
    });
  }, [embed, scrollReaderIntoView, sharedQuote]);

  const syncCompanionPageInUrl = useCallback((nextPage: number) => {
    if (!companionId) return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("with", companionId);
      url.searchParams.set("withPage", String(nextPage));
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* ignore */
    }
  }, [companionId]);

  function jumpCompanionPage(target: number) {
    if (!companionId) return;
    const nextPage = Math.max(1, Math.round(target));
    pendingCompanionJumpRef.current = nextPage;
    setCompanionPage(nextPage);
    syncCompanionPageInUrl(nextPage);
    companionFrameRef.current?.contentWindow?.postMessage(
      { type: "blabla:reader-jump", documentId: companionId, page: nextPage },
      window.location.origin,
    );
  }

  function openLinkedCompanion(item: AnnotationItem) {
    if (!item.companionDocumentId || !item.companionPage) return;
    if (companionId === item.companionDocumentId) {
      jumpCompanionPage(item.companionPage);
      return;
    }
    setCompanion(item.companionDocumentId, item.companionPage);
  }

  const syncMirrorAnnotation = useCallback(
    (item: AnnotationItem) => {
      if (embed && window.parent !== window) {
        window.parent.postMessage({ type: "blabla:annotation-created", annotation: item }, window.location.origin);
        return;
      }
      companionFrameRef.current?.contentWindow?.postMessage(
        { type: "blabla:annotation-created", annotation: item },
        window.location.origin,
      );
    },
    [embed],
  );

  const annotationComments = useMemo(
    () =>
      comments
        .filter((c) => c.annotationId)
        .map((c) => ({
          id: c.id,
          annotationId: c.annotationId,
          body: c.body,
          createdAt: c.createdAt,
          authorId: c.authorId,
          authorName: c.authorName,
        })),
    [comments],
  );

  const companionTarget =
    companionId && companionPage
      ? {
          documentId: companionId,
          page: companionPage,
          pageLabel: companionPageLabel,
          title: liveCompanionTitle,
        }
      : companionId
        ? {
            documentId: companionId,
            page: null,
            pageLabel: companionPageLabel,
            title: liveCompanionTitle,
          }
        : null;

  const companionSrc = useMemo(() => {
    if (!companionId) return "";
    const params = new URLSearchParams({ panel: "1" });
    if (initialCompanionPage && initialCompanionPage >= 1) {
      params.set("page", String(initialCompanionPage));
    }
    return `/documents/${companionId}?${params.toString()}`;
  }, [companionId, initialCompanionPage]);

  useEffect(() => {
    if (!embed || window.parent === window) return;
    window.parent.postMessage(
      {
        type: "blabla:reader-page",
        documentId,
        title: documentTitle ?? null,
        page,
        total: numPages,
        pageLabel,
      },
      window.location.origin,
    );
  }, [documentId, documentTitle, embed, numPages, page, pageLabel]);

  useEffect(() => {
    if (!embed) return;
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data as {
        type?: string;
        documentId?: string;
        page?: unknown;
        annotation?: AnnotationItem;
      } | null;
      if (!data) return;
      if (data.type === "blabla:annotation-created" && data.annotation) {
        appendLiveAnnotation(data.annotation);
        return;
      }
      if (data.type !== "blabla:reader-jump" || data.documentId !== documentId) return;
      const target =
        typeof data.page === "number"
          ? data.page
          : Number.parseInt(String(data.page ?? ""), 10);
      if (!Number.isFinite(target) || target < 1) return;
      handlePageChange(Math.round(target), numPages || Math.round(target));
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [appendLiveAnnotation, documentId, embed, handlePageChange, numPages]);

  useEffect(() => {
    if (embed || !companionId) return;
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data as {
        type?: string;
        documentId?: string;
        page?: unknown;
        pageLabel?: unknown;
        title?: unknown;
        annotation?: AnnotationItem;
      } | null;
      if (!data) return;
      if (data.type === "blabla:annotation-created" && data.annotation) {
        appendLiveAnnotation(data.annotation);
        return;
      }
      if (data.type !== "blabla:reader-page" || data.documentId !== companionId) return;
      const nextPage =
        typeof data.page === "number"
          ? data.page
          : Number.parseInt(String(data.page ?? ""), 10);
      if (Number.isFinite(nextPage) && nextPage >= 1) {
        pendingCompanionJumpRef.current = null;
        setCompanionPage(Math.round(nextPage));
        syncCompanionPageInUrl(Math.round(nextPage));
      }
      setCompanionPageLabel(typeof data.pageLabel === "string" && data.pageLabel ? data.pageLabel : "стр.");
      if (typeof data.title === "string" && data.title.trim()) {
        setLiveCompanionTitle(data.title.trim());
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [appendLiveAnnotation, companionId, embed, syncCompanionPageInUrl]);

  const showCompanionPanel = Boolean(companionId && !embed && !fullscreen);
  const effectiveMarksPlace: MarksPlacement =
    showCompanionPanel && marksPlace === "left" ? "below" : marksPlace;
  const showLeftMarks = !embed && !fullscreen && effectiveMarksPlace === "left";
  const marksLayoutClass = showLeftMarks ? "lg:flex lg:items-start lg:gap-3" : "";
  const canJumpPages = isPdf || isEpub || isTxt;
  const readerCompact = embed || showCompanionPanel;

  return (
    <div>
      {!embed && !fullscreen && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/10 bg-ink/[0.02] px-3.5 py-2.5">
          <div className="min-w-0 flex-1">
            {catalogHref && (
              <a
                href={catalogHref}
                className="mb-0.5 inline-flex items-center gap-1 text-[11px] text-muted transition-colors hover:text-ink"
              >
                <ArrowRight size={11} className="rotate-180" />
                К каталогу
              </a>
            )}
            <p className="truncate font-serif text-lg leading-tight tracking-tight md:text-xl">
              {documentTitle || "Текст"}
            </p>
            <p className="truncate text-xs text-muted">
              {documentAuthors || "Автор не указан"}
              {(isPdf || isEpub || isTxt) && numPages > 0 && (
                <>
                  {" · "}
                  {isEpub ? "глава" : isTxt ? "лист" : "стр."} {page}
                  {numPages ? ` / ${numPages}` : ""}
                </>
              )}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {!embed && (
              <CompanionPicker
                companionId={companionId}
                editions={otherEditions}
                suggestions={suggestions}
                onPick={(id) => setCompanion(id)}
              />
            )}
            {canFullscreen && (
              <button
                type="button"
                onClick={() => setFullscreen(true)}
                className="icon-button shrink-0"
                aria-label="Развернуть на весь экран"
                title="Читать на весь экран"
              >
                <Maximize2 size={15} />
              </button>
            )}
          </div>
        </div>
      )}

      <div className={fullscreen ? "fixed inset-0 z-50 flex flex-col bg-paper" : ""}>
        {fullscreen && (
          <div className="flex items-center justify-between gap-3 border-b border-ink/10 px-4 py-2 md:px-8">
            <div className="min-w-0">
              <p className="truncate font-serif text-base">{documentTitle || "Текст"}</p>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
                Esc — выйти
                {numPages > 0 &&
                  ` · ${isEpub ? "глава" : isTxt ? "лист" : "стр."} ${page}/${numPages}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFullscreen(false)}
              className="icon-button"
              aria-label="Свернуть"
            >
              <Minimize2 size={15} />
            </button>
          </div>
        )}
        <div className={fullscreen ? "min-h-0 flex-1 overflow-y-auto px-4 pb-12 md:px-8" : ""}>
          {showCompanionPanel ? (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.16fr)_minmax(24rem,0.94fr)] 2xl:grid-cols-[minmax(0,1.08fr)_minmax(28rem,0.92fr)] xl:items-start">
              <div className="min-w-0">
                {!embed && !fullscreen && effectiveMarksPlace === "hidden" && (
                  <MarksDock
                    annotations={liveAnnotations}
                    currentUserId={currentUser?.id ?? null}
                    pageLabel={pageLabel}
                    canJump={canJumpPages}
                    onJumpToPage={(target) => jumpToReaderPage(target)}
                    placement="hidden"
                    onPlacementChange={setMarksPlace}
                    onOpenLinkedCompanion={openLinkedCompanion}
                    allowLeftPlacement={false}
                  />
                )}
                <div className={marksLayoutClass}>
              {showLeftMarks && (
                <MarksDock
                      annotations={liveAnnotations}
                      currentUserId={currentUser?.id ?? null}
                      pageLabel={pageLabel}
                      canJump={canJumpPages}
                      onJumpToPage={(target) => jumpToReaderPage(target)}
                      placement="left"
                      onPlacementChange={setMarksPlace}
                      onOpenLinkedCompanion={openLinkedCompanion}
                      allowLeftPlacement={false}
                    />
                  )}
                  <div ref={readerHostRef} className="min-w-0 flex-1">
                    {progressReady && fileUrl && isPdf && (
                      <PdfReader
                        url={fileUrl}
                        page={page}
                        onPageChange={handlePageChange}
                        documentId={documentId}
                        currentUserId={currentUser?.id ?? null}
                        initialAnnotations={liveAnnotations}
                        comments={annotationComments}
                        onReplyToAnnotation={replyToAnnotation}
                        onReport={(type, id) => setReportTarget({ type, id })}
                        fullscreen={fullscreen}
                        canAnnotate={canAnnotate}
                        language={language}
                        onAnnotationsChange={setLiveAnnotations}
                        companionTarget={companionTarget}
                        onOpenLinkedCompanion={openLinkedCompanion}
                        onMirrorAnnotationCreated={syncMirrorAnnotation}
                        sharedQuote={sharedQuote}
                        compact={readerCompact}
                      />
                    )}
                    {progressReady && fileUrl && isEpub && (
                      <EpubReader
                        url={fileUrl}
                        page={page}
                        onPageChange={handlePageChange}
                        documentId={documentId}
                        currentUserId={currentUser?.id ?? null}
                        initialAnnotations={liveAnnotations}
                        comments={annotationComments}
                        onReplyToAnnotation={replyToAnnotation}
                        onReport={(type, id) => setReportTarget({ type, id })}
                        fullscreen={fullscreen}
                        canAnnotate={canAnnotate}
                        language={language}
                        onAnnotationsChange={setLiveAnnotations}
                        companionTarget={companionTarget}
                        onOpenLinkedCompanion={openLinkedCompanion}
                        onMirrorAnnotationCreated={syncMirrorAnnotation}
                        compact={readerCompact}
                      />
                    )}
                    {progressReady && fileUrl && isTxt && (
                      <TxtReader
                        url={fileUrl}
                        language={language}
                        fullscreen={fullscreen}
                        page={page}
                        onPageChange={handlePageChange}
                        documentId={documentId}
                        currentUserId={currentUser?.id ?? null}
                        initialAnnotations={liveAnnotations}
                        comments={annotationComments}
                        onReplyToAnnotation={replyToAnnotation}
                        onReport={(type, id) => setReportTarget({ type, id })}
                        canAnnotate={canAnnotate}
                        onAnnotationsChange={setLiveAnnotations}
                        companionTarget={companionTarget}
                        onOpenLinkedCompanion={openLinkedCompanion}
                        onMirrorAnnotationCreated={syncMirrorAnnotation}
                        compact={readerCompact}
                      />
                    )}
                    {fileUrl && !isPdf && !isEpub && !isTxt && (
                      <p className="rounded-2xl border border-ink/10 bg-ink/[0.02] p-8 text-center text-sm text-muted">
                        Формат {fileType} пока не открывается прямо в браузере —
                        скачайте файл, чтобы прочитать.
                      </p>
                    )}
                    {!fileUrl && (
                      <p className="rounded-2xl border border-ink/10 bg-ink/[0.02] p-8 text-center text-sm text-muted">
                        Файл недоступен.
                      </p>
                    )}
                    {!embed && !fullscreen && effectiveMarksPlace === "below" && (
                      <MarksDock
                        annotations={liveAnnotations}
                        currentUserId={currentUser?.id ?? null}
                        pageLabel={pageLabel}
                        canJump={canJumpPages}
                        onJumpToPage={(target) => jumpToReaderPage(target, true)}
                        placement="below"
                        onPlacementChange={setMarksPlace}
                        onOpenLinkedCompanion={openLinkedCompanion}
                        allowLeftPlacement={false}
                      />
                    )}
                  </div>
                </div>

                {!embed && (
                  <div className="mx-auto mt-10 max-w-3xl space-y-6">
                    {canJumpPages && (
                      <BookmarksPanel
                        documentId={documentId}
                        canJump
                        pageLabel={pageLabel}
                        onJumpToPage={(target) => jumpToReaderPage(target, true)}
                      />
                    )}
                    <CommentThread
                      documentId={documentId}
                      documentTitle={documentTitle}
                      comments={comments}
                      currentUser={currentUser}
                      currentPage={canJumpPages ? page : null}
                      maxPage={numPages}
                      pageLabel={pageLabel}
                      onJumpToPage={
                        canJumpPages
                          ? (target) => {
                              jumpToReaderPage(target, true);
                            }
                          : undefined
                      }
                      onReport={(id) => setReportTarget({ type: "comment", id })}
                    />
                  </div>
                )}
              </div>

              <aside className="min-w-0 overflow-hidden rounded-2xl border border-ink/10 bg-ink/[0.02] p-3 md:p-4 xl:sticky xl:top-5">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
                      Параллельное чтение
                    </p>
                    <p className="truncate text-sm text-ink">
                      {liveCompanionTitle || "Вторая книга"}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {companionPage ? `${companionPageLabel} ${companionPage}` : "Страница не выбрана"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCompanion("")}
                    className="shrink-0 text-xs text-muted hover:text-ink"
                  >
                    Скрыть
                  </button>
                </div>
                <iframe
                  ref={companionFrameRef}
                  title={liveCompanionTitle || "Параллельный текст"}
                  src={companionSrc}
                  loading="lazy"
                  className="h-[72vh] min-h-[34rem] w-full rounded-2xl border border-ink/10 bg-paper"
                  onLoad={() => {
                    const pending = pendingCompanionJumpRef.current ?? companionPage;
                    if (!companionId || !pending) return;
                    window.setTimeout(() => {
                      companionFrameRef.current?.contentWindow?.postMessage(
                        { type: "blabla:reader-jump", documentId: companionId, page: pending },
                        window.location.origin,
                      );
                    }, 0);
                  }}
                />
              </aside>
            </div>
          ) : (
            <>
              {!embed && !fullscreen && effectiveMarksPlace === "hidden" && (
                <MarksDock
                  annotations={liveAnnotations}
                  currentUserId={currentUser?.id ?? null}
                  pageLabel={pageLabel}
                  canJump={canJumpPages}
                  onJumpToPage={(target) => jumpToReaderPage(target)}
                  placement="hidden"
                  onPlacementChange={setMarksPlace}
                  onOpenLinkedCompanion={openLinkedCompanion}
                />
              )}
              <div className={marksLayoutClass}>
                {showLeftMarks && (
                  <MarksDock
                    annotations={liveAnnotations}
                    currentUserId={currentUser?.id ?? null}
                    pageLabel={pageLabel}
                    canJump={canJumpPages}
                    onJumpToPage={(target) => jumpToReaderPage(target)}
                    placement="left"
                    onPlacementChange={setMarksPlace}
                    onOpenLinkedCompanion={openLinkedCompanion}
                  />
                )}
                  <div ref={readerHostRef} className="min-w-0 flex-1">
                    {progressReady && fileUrl && isPdf && (
                      <PdfReader
                      url={fileUrl}
                      page={page}
                      onPageChange={handlePageChange}
                      documentId={documentId}
                      currentUserId={currentUser?.id ?? null}
                      initialAnnotations={liveAnnotations}
                      comments={annotationComments}
                      onReplyToAnnotation={replyToAnnotation}
                      onReport={(type, id) => setReportTarget({ type, id })}
                      fullscreen={fullscreen}
                      canAnnotate={canAnnotate}
                      language={language}
                      onAnnotationsChange={setLiveAnnotations}
                      companionTarget={companionTarget}
                      onOpenLinkedCompanion={openLinkedCompanion}
                      onMirrorAnnotationCreated={syncMirrorAnnotation}
                      sharedQuote={sharedQuote}
                      compact={readerCompact}
                    />
                  )}
                  {progressReady && fileUrl && isEpub && (
                    <EpubReader
                      url={fileUrl}
                      page={page}
                      onPageChange={handlePageChange}
                      documentId={documentId}
                      currentUserId={currentUser?.id ?? null}
                      initialAnnotations={liveAnnotations}
                      comments={annotationComments}
                      onReplyToAnnotation={replyToAnnotation}
                      onReport={(type, id) => setReportTarget({ type, id })}
                      fullscreen={fullscreen}
                      canAnnotate={canAnnotate}
                      language={language}
                      onAnnotationsChange={setLiveAnnotations}
                      companionTarget={companionTarget}
                      onOpenLinkedCompanion={openLinkedCompanion}
                      onMirrorAnnotationCreated={syncMirrorAnnotation}
                      compact={readerCompact}
                    />
                  )}
                  {progressReady && fileUrl && isTxt && (
                    <TxtReader
                      url={fileUrl}
                      language={language}
                      fullscreen={fullscreen}
                      page={page}
                      onPageChange={handlePageChange}
                      documentId={documentId}
                      currentUserId={currentUser?.id ?? null}
                      initialAnnotations={liveAnnotations}
                      comments={annotationComments}
                      onReplyToAnnotation={replyToAnnotation}
                      onReport={(type, id) => setReportTarget({ type, id })}
                      canAnnotate={canAnnotate}
                      onAnnotationsChange={setLiveAnnotations}
                      companionTarget={companionTarget}
                      onOpenLinkedCompanion={openLinkedCompanion}
                      onMirrorAnnotationCreated={syncMirrorAnnotation}
                      compact={readerCompact}
                    />
                  )}
                  {fileUrl && !isPdf && !isEpub && !isTxt && (
                    <p className="rounded-2xl border border-ink/10 bg-ink/[0.02] p-8 text-center text-sm text-muted">
                      Формат {fileType} пока не открывается прямо в браузере —
                      скачайте файл, чтобы прочитать.
                    </p>
                  )}
                  {!fileUrl && (
                    <p className="rounded-2xl border border-ink/10 bg-ink/[0.02] p-8 text-center text-sm text-muted">
                      Файл недоступен.
                    </p>
                  )}
                  {!embed && !fullscreen && effectiveMarksPlace === "below" && (
                    <MarksDock
                      annotations={liveAnnotations}
                      currentUserId={currentUser?.id ?? null}
                      pageLabel={pageLabel}
                      canJump={canJumpPages}
                      onJumpToPage={(target) => jumpToReaderPage(target, true)}
                      placement="below"
                      onPlacementChange={setMarksPlace}
                      onOpenLinkedCompanion={openLinkedCompanion}
                    />
                  )}
                </div>
              </div>

              {!embed && (
                <div className="mx-auto mt-10 max-w-3xl space-y-6">
                    {canJumpPages && (
                      <BookmarksPanel
                        documentId={documentId}
                        canJump
                        pageLabel={pageLabel}
                        onJumpToPage={(target) => jumpToReaderPage(target, true)}
                      />
                    )}
                  <CommentThread
                    documentId={documentId}
                    documentTitle={documentTitle}
                    comments={comments}
                    currentUser={currentUser}
                    currentPage={canJumpPages ? page : null}
                    maxPage={numPages}
                    pageLabel={pageLabel}
                      onJumpToPage={
                        canJumpPages
                          ? (target) => {
                              jumpToReaderPage(target, true);
                            }
                          : undefined
                      }
                    onReport={(id) => setReportTarget({ type: "comment", id })}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <ReportDialog
        open={Boolean(reportTarget)}
        targetType={reportTarget?.type ?? null}
        targetId={reportTarget?.id ?? null}
        onClose={() => setReportTarget(null)}
      />
    </div>
  );
}

function CommentThread({
  documentId,
  documentTitle,
  comments,
  currentUser,
  currentPage,
  maxPage,
  pageLabel = "стр.",
  onJumpToPage,
  onReport,
}: {
  documentId: string;
  documentTitle?: string;
  comments: CommentItem[];
  currentUser: CurrentUser;
  currentPage: number | null;
  maxPage: number;
  pageLabel?: string;
  onJumpToPage?: (page: number) => void;
  onReport?: (commentId: string) => void;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [attachPage, setAttachPage] = useState(Boolean(currentPage));
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [sectionOpen, setSectionOpen] = useState<Record<string, boolean>>({ general: true });
  const composeRef = useRef<HTMLTextAreaElement | null>(null);

  const pageComments = useMemo(() => comments.filter((c) => !c.annotationId), [comments]);
  const topLevel = useMemo(() => pageComments.filter((c) => !c.parentId), [pageComments]);
  const repliesByParent = useMemo(() => {
    const map = new Map<string, CommentItem[]>();
    for (const comment of pageComments) {
      if (!comment.parentId) continue;
      const list = map.get(comment.parentId) ?? [];
      list.push(comment);
      map.set(comment.parentId, list);
    }
    return map;
  }, [pageComments]);

  const sections = useMemo(() => {
    const byKey = new Map<string, CommentItem[]>();
    for (const comment of topLevel) {
      const key = comment.page != null ? `p:${comment.page}` : "general";
      const list = byKey.get(key) ?? [];
      list.push(comment);
      byKey.set(key, list);
    }
    const keys = [...byKey.keys()].sort((a, b) => {
      if (a === "general") return 1;
      if (b === "general") return -1;
      return Number(a.slice(2)) - Number(b.slice(2));
    });
    return keys.map((key) => ({
      key,
      title: key === "general" ? "Общие замечания" : `${pageLabel} ${key.slice(2)}`,
      page: key.startsWith("p:") ? Number(key.slice(2)) : null,
      items: byKey.get(key) ?? [],
    }));
  }, [topLevel, pageLabel]);

  useEffect(() => {
    function handleDiscussionShare(event: Event) {
      const detail = (event as CustomEvent<{ body?: string }>).detail;
      const queuedBody = detail?.body?.trim();
      if (!queuedBody) return;
      setBody((current) => (current.trim() ? `${current.trim()}\n\n${queuedBody}` : queuedBody));
      setReplyBody("");
      setReplyTo(null);
      setSectionOpen((current) => ({ ...current, general: true }));
      window.requestAnimationFrame(() => {
        composeRef.current?.focus();
        composeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      });
    }
    window.addEventListener("blabla:discussion-share", handleDiscussionShare as EventListener);
    return () => window.removeEventListener("blabla:discussion-share", handleDiscussionShare as EventListener);
  }, []);

  async function postComment(text: string, page: number | null, parentId: string | null) {
    setBusy(true);
    const response = await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId, body: text, page, parentId }),
    });
    setBusy(false);
    if (response.ok) {
      setBody("");
      setReplyBody("");
      setReplyTo(null);
      router.refresh();
    }
  }

  async function editComment(id: string, text: string) {
    const response = await fetch(`/api/comments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text }),
    });
    if (response.ok) router.refresh();
  }

  async function deleteComment(id: string) {
    if (!window.confirm("Удалить комментарий?")) return;
    const response = await fetch(`/api/comments/${id}`, { method: "DELETE" });
    if (response.ok) router.refresh();
  }

  function toChatItem(comment: CommentItem) {
    return {
      id: comment.id,
      body: comment.body,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      page: comment.page,
      author: {
        id: comment.authorId,
        name: comment.authorName,
        role: comment.authorRole,
        avatarKey: comment.authorAvatarKey,
        avatarColor: comment.authorAvatarColor,
      },
    };
  }

  function renderThread(comment: CommentItem) {
    const replies = repliesByParent.get(comment.id) ?? [];
    const bodyCollapsed = collapsed[`body:${comment.id}`] ?? false;
    const repliesCollapsed = collapsed[`replies:${comment.id}`] ?? true;
    const isOwn = currentUser?.id === comment.authorId;
    return (
      <div key={comment.id} className="pt-2">
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={() =>
              setCollapsed((c) => ({ ...c, [`body:${comment.id}`]: !bodyCollapsed }))
            }
            className="mt-0.5 shrink-0 text-muted hover:text-ink"
            aria-label={bodyCollapsed ? "Развернуть комментарий" : "Свернуть комментарий"}
            title={bodyCollapsed ? "Развернуть" : "Свернуть"}
          >
            {bodyCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
          <div className="min-w-0 flex-1">
            <ChatMessage
              item={toChatItem(comment)}
              currentUserId={currentUser?.id ?? null}
              documentTitle={documentTitle}
              pageLabel={pageLabel}
              onJumpToPage={onJumpToPage}
              onReport={onReport}
              compact={bodyCollapsed}
              onReply={currentUser && !bodyCollapsed ? () => setReplyTo(comment.id) : undefined}
              onEdit={isOwn && !bodyCollapsed ? (text) => editComment(comment.id, text) : undefined}
              onDelete={isOwn && !bodyCollapsed ? () => deleteComment(comment.id) : undefined}
            />
            {!bodyCollapsed && replies.length > 0 && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() =>
                    setCollapsed((c) => ({
                      ...c,
                      [`replies:${comment.id}`]: !repliesCollapsed,
                    }))
                  }
                  className="mb-2 flex items-center gap-1 text-xs text-muted hover:text-ink"
                >
                  {repliesCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                  {repliesCollapsed
                    ? `Ответы (${replies.length})`
                    : `Свернуть ответы (${replies.length})`}
                </button>
                {!repliesCollapsed &&
                  replies.map((reply) => {
                    const replyOwn = currentUser?.id === reply.authorId;
                    return (
                      <div key={reply.id} className="ml-3 mt-3 border-l border-ink/10 pl-3">
                        <ChatMessage
                          item={toChatItem(reply)}
                          currentUserId={currentUser?.id ?? null}
                          documentTitle={documentTitle}
                          pageLabel={pageLabel}
                          onJumpToPage={onJumpToPage}
                          onReport={onReport}
                          onEdit={replyOwn ? (text) => editComment(reply.id, text) : undefined}
                          onDelete={replyOwn ? () => deleteComment(reply.id) : undefined}
                        />
                      </div>
                    );
                  })}
              </div>
            )}
            {!bodyCollapsed && currentUser && replyTo === comment.id && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!replyBody.trim()) return;
                  postComment(replyBody.trim(), null, comment.id);
                }}
                className="mt-2 flex items-center gap-2"
              >
                <input
                  value={replyBody}
                  onChange={(event) => setReplyBody(event.target.value)}
                  placeholder="Ответить…"
                  className="flex-1 rounded-lg border border-ink/15 bg-white/60 px-3 py-1.5 text-sm outline-none focus:border-ink/40 dark:bg-white/5"
                  autoFocus
                />
                <button type="submit" className="icon-button" disabled={busy} aria-label="Отправить ответ">
                  <Send size={13} />
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <aside className="rounded-2xl border border-ink/10 bg-paper p-6">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <MessageSquare size={17} />
        <h2 className="font-serif text-2xl">Обсуждение</h2>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <ShareWithFriends
            compact
            buttonLabel="Книга"
            buttonClassName="!min-h-8 !px-3 !text-[11px]"
            payload={{
              kind: "book",
              title: documentTitle || "Книга",
              url: buildDiscussionShareUrl(),
            }}
          />
          {currentPage != null && (
            <ShareWithFriends
              compact
              buttonLabel={`${pageLabel} ${currentPage}`}
              buttonClassName="!min-h-8 !px-3 !text-[11px]"
              payload={{
                kind: "quote",
                title: `${documentTitle || "Книга"} · ${pageLabel} ${currentPage}`,
                url: buildDiscussionShareUrl(currentPage),
              }}
            />
          )}
          <span className="font-mono text-xs text-muted">{pageComments.length}</span>
        </div>
      </div>
      <p className="mb-5 max-w-xl text-sm leading-6 text-muted">
        Здесь читают вместе: вопросы к месту в тексте, параллели с другими авторами,
        споры о переводе. Стрелка слева сворачивает нить — удобно, когда их много.
      </p>

      {currentUser ? (
        <form
          id="discussion-compose"
          onSubmit={(event) => {
            event.preventDefault();
            if (!body.trim()) return;
            postComment(body.trim(), attachPage ? currentPage : null, null);
          }}
          className="mb-6 space-y-3"
        >
          <textarea
            ref={composeRef}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Поделитесь мыслью… Можно формулы: $E=mc^2$ или $$\\int f$$"
            rows={3}
            className="w-full rounded-xl border border-ink/15 bg-white/60 p-3 text-sm outline-none focus:border-ink/40 dark:bg-white/5"
          />
          <div className="flex items-center justify-between">
            {currentPage ? (
              <label className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={attachPage}
                  onChange={(event) => setAttachPage(event.target.checked)}
                />
                Привязать к {pageLabel} {currentPage}
                {maxPage ? ` из ${maxPage}` : ""}
              </label>
            ) : (
              <span />
            )}
            <button type="submit" className="button-secondary" disabled={busy}>
              <Send size={14} />
              Отправить
            </button>
          </div>
        </form>
      ) : (
        <p className="mb-6 rounded-xl bg-ink/5 p-4 text-sm text-muted">
          Чтобы оставить комментарий или пометку,{" "}
          <a href="/login" className="font-medium text-ink underline">
            войдите в аккаунт
          </a>
          .
        </p>
      )}

      <div className="space-y-4">
        {topLevel.length === 0 && (
          <div className="rounded-xl border border-dashed border-ink/15 px-4 py-5 text-sm text-muted">
            <p className="font-medium text-ink">Пока тихо — можно начать нить.</p>
            <p className="mt-1.5 leading-6">
              Задайте вопрос к странице, свяжите с другим текстом или оставьте заметку для
              следующих читателей. Привязка к {pageLabel} помогает сразу открыть место в книге.
            </p>
          </div>
        )}
        {sections.map((section) => {
          const open =
            sectionOpen[section.key] ??
            (section.page != null && currentPage != null
              ? section.page === currentPage
              : section.key === "general");
          return (
            <section key={section.key} className="rounded-xl border border-ink/10">
              <button
                type="button"
                onClick={() => setSectionOpen((s) => ({ ...s, [section.key]: !open }))}
                className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm hover:bg-ink/[0.03]"
              >
                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="font-medium">{section.title}</span>
                {section.page != null && onJumpToPage && (
                  <span
                    role="link"
                    tabIndex={0}
                    onClick={(event) => {
                      event.stopPropagation();
                      onJumpToPage(section.page!);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.stopPropagation();
                        onJumpToPage(section.page!);
                      }
                    }}
                    className="text-xs text-muted underline-offset-2 hover:text-rust hover:underline"
                  >
                    открыть
                  </span>
                )}
                <span className="ml-auto font-mono text-[10px] text-muted">{section.items.length}</span>
              </button>
              {open && <div className="space-y-2 px-3.5 pb-3">{section.items.map(renderThread)}</div>}
            </section>
          );
        })}
      </div>
    </aside>
  );
}

function BookmarksPanel({
  documentId,
  canJump,
  pageLabel,
  onJumpToPage,
}: {
  documentId: string;
  canJump: boolean;
  pageLabel: string;
  onJumpToPage: (page: number) => void;
}) {
  const [items, setItems] = useState<ReaderBookmark[]>([]);

  useEffect(() => {
    function refresh() {
      setItems(loadBookmarks(documentId));
    }
    refresh();
    function onChange(event: Event) {
      const detail = (event as CustomEvent<{ documentId?: string }>).detail;
      if (!detail?.documentId || detail.documentId === documentId) refresh();
    }
    window.addEventListener("blabla:bookmarks-changed", onChange);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("blabla:bookmarks-changed", onChange);
      window.removeEventListener("storage", refresh);
    };
  }, [documentId]);

  if (items.length === 0) {
    return (
      <aside className="rounded-2xl border border-dashed border-ink/15 bg-ink/[0.015] px-5 py-4 text-sm text-muted">
        <div className="mb-1 flex items-center gap-2 font-medium text-ink">
          <Bookmark size={15} className="text-rust" />
          Закладки
        </div>
        Нажмите иконку закладки в панели чтения, чтобы отметить раздел. Последняя открытая
        страница запоминается отдельно (на этом устройстве и, если книга на полке, в аккаунте).
      </aside>
    );
  }

  return (
    <aside className="rounded-2xl border border-ink/10 bg-paper p-5">
      <div className="mb-3 flex items-center gap-2">
        <Bookmark size={16} className="text-rust" />
        <h2 className="font-serif text-xl">Закладки</h2>
        <span className="ml-auto font-mono text-xs text-muted">{items.length}</span>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-2 rounded-xl border border-ink/10 px-3 py-2 text-sm"
          >
            <button
              type="button"
              disabled={!canJump}
              onClick={() => onJumpToPage(item.page)}
              className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left transition-colors hover:text-rust disabled:cursor-default"
            >
              <span className="truncate">{item.label}</span>
              <span className="flex shrink-0 items-center gap-1 font-mono text-xs text-muted">
                {pageLabel} {item.page}
                <ArrowRight size={12} />
              </span>
            </button>
            <button
              type="button"
              onClick={() => setItems(removeBookmark(documentId, item.id))}
              className="icon-button !size-8 hover:!border-red-700 hover:!text-red-700"
              aria-label="Удалить закладку"
              title="Удалить закладку"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
