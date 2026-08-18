"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Bookmark,
  ChevronDown,
  ChevronRight,
  Columns2,
  Filter,
  Maximize2,
  MessageSquare,
  Minimize2,
  Send,
  StickyNote,
  Trash2,
} from "lucide-react";
import { ChatMessage } from "@/components/chat-message";
import type { AnnotationItem } from "@/components/readers/annotation-layer";
import { ReportDialog } from "@/components/report-dialog";
import { ShareWithFriends } from "@/components/share-with-friends";
import { countLabel } from "@/lib/pluralize";
import {
  loadBookmarks,
  removeBookmark,
  type ReaderBookmark,
} from "@/lib/bookmarks";
import {
  loadReadingProgress,
  pruneReadingProgress,
  saveReadingProgress,
  type ReadingProgressKind,
} from "@/lib/reading-progress";
import { canAnnotateFiles } from "@/lib/roles";
import { languageLabel } from "@/lib/languages";

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
  const canFullscreen = Boolean(fileUrl) && (isPdf || isEpub || isTxt);
  const canAnnotate = canAnnotateFiles(currentUser?.role);
  const otherEditions = editions.filter((item) => item.id !== documentId);

  function setCompanion(nextId: string) {
    const url = new URL(window.location.href);
    if (nextId) url.searchParams.set("with", nextId);
    else url.searchParams.delete("with");
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

  function syncCloud(nextPage: number, total?: number) {
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
  }

  function persistPosition(nextPage: number, total?: number) {
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
  }

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

  function handlePageChange(next: number, total: number) {
    setPage(next);
    setNumPages(total);
    persistPosition(next, total);
  }

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

  return (
    <div>
      {embed && (
        <p className="mb-3 truncate font-serif text-base leading-tight tracking-tight">
          {documentTitle || "Текст"}
        </p>
      )}
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
            {otherEditions.length > 0 ? (
              <label className="flex min-w-0 items-center gap-2 rounded-full border border-rust/35 bg-rust/10 px-3 py-1.5 text-xs text-ink">
                <Columns2 size={15} className="shrink-0 text-rust" />
                <span className="hidden font-medium sm:inline">Два текста</span>
                <select
                  className="max-w-[16rem] truncate bg-transparent text-xs text-ink outline-none"
                  value={companionId ?? ""}
                  onChange={(event) => setCompanion(event.target.value)}
                >
                  <option value="">Одно окно</option>
                  {otherEditions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.roleLabel}
                      {item.language ? ` · ${languageLabel(item.language)}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span className="hidden max-w-[14rem] text-[11px] leading-4 text-muted lg:inline">
                Два текста: откройте издание ниже кнопкой «Рядом», либо соседнюю книгу.
              </span>
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
          {progressReady && fileUrl && isPdf && (
            <PdfReader
              url={fileUrl}
              page={page}
              onPageChange={handlePageChange}
              documentId={documentId}
              currentUserId={currentUser?.id ?? null}
              initialAnnotations={annotations}
              comments={annotationComments}
              onReplyToAnnotation={replyToAnnotation}
              onReport={(type, id) => setReportTarget({ type, id })}
              fullscreen={fullscreen}
              canAnnotate={canAnnotate}
              language={language}
            />
          )}
          {progressReady && fileUrl && isEpub && (
            <EpubReader
              url={fileUrl}
              page={page}
              onPageChange={handlePageChange}
              documentId={documentId}
              currentUserId={currentUser?.id ?? null}
              initialAnnotations={annotations}
              comments={annotationComments}
              onReplyToAnnotation={replyToAnnotation}
              onReport={(type, id) => setReportTarget({ type, id })}
              fullscreen={fullscreen}
              canAnnotate={canAnnotate}
              language={language}
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
              initialAnnotations={annotations}
              comments={annotationComments}
              onReplyToAnnotation={replyToAnnotation}
              onReport={(type, id) => setReportTarget({ type, id })}
              canAnnotate={canAnnotate}
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

          {!embed && (
          <div className="mx-auto mt-10 max-w-3xl space-y-6">
            {(isPdf || isEpub || isTxt) && (
              <BookmarksPanel
                documentId={documentId}
                canJump
                pageLabel={isEpub ? "глава" : isTxt ? "лист" : "стр."}
                onJumpToPage={(target) => handlePageChange(target, numPages || target)}
              />
            )}
            <CommentThread
              documentId={documentId}
              comments={comments}
              currentUser={currentUser}
              currentPage={isPdf || isEpub || isTxt ? page : null}
              maxPage={numPages}
              pageLabel={isEpub ? "глава" : isTxt ? "лист" : "стр."}
              onJumpToPage={
                isPdf || isEpub || isTxt
                  ? (target) => {
                      handlePageChange(target, numPages || target);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }
                  : undefined
              }
              onReport={(id) => setReportTarget({ type: "comment", id })}
            />
            {annotations.length > 0 && (
              <AnnotationsIndex
                annotations={annotations}
                canJump={isPdf || isEpub || isTxt}
                onJumpToPage={(target) => handlePageChange(target, numPages || target)}
                documentId={documentId}
                documentTitle={documentTitle}
                canShare={Boolean(currentUser)}
                pageLabel={isEpub ? "глава" : isTxt ? "лист" : "стр."}
              />
            )}
          </div>
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
  comments,
  currentUser,
  currentPage,
  maxPage,
  pageLabel = "стр.",
  onJumpToPage,
  onReport,
}: {
  documentId: string;
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
      <div className="mb-2 flex items-center gap-2">
        <MessageSquare size={17} />
        <h2 className="font-serif text-2xl">Обсуждение</h2>
        <span className="ml-auto font-mono text-xs text-muted">{pageComments.length}</span>
      </div>
      <p className="mb-5 max-w-xl text-sm leading-6 text-muted">
        Здесь читают вместе: вопросы к месту в тексте, параллели с другими авторами,
        споры о переводе. Стрелка слева сворачивает нить — удобно, когда их много.
      </p>

      {currentUser ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!body.trim()) return;
            postComment(body.trim(), attachPage ? currentPage : null, null);
          }}
          className="mb-6 space-y-3"
        >
          <textarea
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

/** Bridges stickers scattered across the reader with the discussion below it — filter by who
 * left a mark and where, then jump straight to that page instead of hunting through it. */
function AnnotationsIndex({
  annotations,
  canJump,
  onJumpToPage,
  documentId,
  documentTitle,
  canShare,
  pageLabel = "стр.",
}: {
  annotations: AnnotationItem[];
  canJump: boolean;
  onJumpToPage: (page: number) => void;
  documentId: string;
  documentTitle?: string;
  canShare?: boolean;
  pageLabel?: string;
}) {
  const [author, setAuthor] = useState("");
  const [pageFilter, setPageFilter] = useState("");

  const authors = useMemo(
    () => [...new Set(annotations.map((a) => a.authorName))].sort((a, b) => a.localeCompare(b, "ru")),
    [annotations],
  );
  const pages = useMemo(
    () => [...new Set(annotations.map((a) => a.page))].sort((a, b) => a - b),
    [annotations],
  );

  const filtered = annotations
    .filter((a) => !author || a.authorName === author)
    .filter((a) => !pageFilter || a.page === Number(pageFilter))
    .sort((a, b) => a.page - b.page);

  return (
    <aside className="rounded-2xl border border-ink/10 bg-paper p-6">
      <div className="mb-4 flex items-center gap-2">
        <StickyNote size={17} />
        <h2 className="font-serif text-xl">Пометки на этих страницах</h2>
        <span className="ml-auto font-mono text-xs text-muted">{countLabel(annotations.length, ["пометка", "пометки", "пометок"])}</span>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <Filter size={13} className="text-muted" />
        <select value={author} onChange={(event) => setAuthor(event.target.value)} className="rounded-full border border-ink/15 bg-transparent px-3 py-1.5">
          <option value="">Все авторы</option>
          {authors.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <select value={pageFilter} onChange={(event) => setPageFilter(event.target.value)} className="rounded-full border border-ink/15 bg-transparent px-3 py-1.5">
          <option value="">Все страницы</option>
          {pages.map((p) => (
            <option key={p} value={p}>
              {pageLabel} {p}
            </option>
          ))}
        </select>
        {(author || pageFilter) && (
          <button
            type="button"
            onClick={() => {
              setAuthor("");
              setPageFilter("");
            }}
            className="text-muted hover:text-ink"
          >
            Сбросить
          </button>
        )}
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && <p className="text-sm text-muted">Пометок не найдено.</p>}
        {filtered.map((item) => {
          const excerpt =
            item.shape === "drawing"
              ? "рисунок"
              : item.shape === "formula"
                ? item.body || "формула"
                : item.body || item.anchorText || "без текста";
          const shareUrl = `/documents/${documentId}?page=${item.page}`;
          return (
            <div
              key={item.id}
              className="flex items-center gap-2 rounded-xl border border-ink/10 px-3.5 py-2.5"
            >
              <button
                type="button"
                onClick={() => canJump && onJumpToPage(item.page)}
                disabled={!canJump}
                className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left text-sm transition-colors hover:text-rust disabled:cursor-default disabled:hover:text-inherit"
              >
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium text-ink">{item.authorName}</span>
                  <span className="text-muted"> · {excerpt.slice(0, 60)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 font-mono text-xs text-muted">
                  {pageLabel} {item.page}
                  {canJump && <ArrowRight size={12} />}
                </span>
              </button>
              {canShare && (
                <ShareWithFriends
                  compact
                  payload={{
                    kind: "annotation",
                    title: documentTitle || "Пометка",
                    url: shareUrl,
                    excerpt,
                  }}
                />
              )}
            </div>
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
              onClick={() => {
                onJumpToPage(item.page);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
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
