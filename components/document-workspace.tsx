"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Filter,
  Maximize2,
  MessageSquare,
  Minimize2,
  Reply,
  Send,
  StickyNote,
  TriangleAlert,
} from "lucide-react";
import type { AnnotationItem } from "@/components/readers/annotation-layer";
import { countLabel } from "@/lib/pluralize";
import { canAnnotateFiles } from "@/lib/roles";

const PdfReader = dynamic(
  () => import("@/components/readers/pdf-reader").then((m) => m.PdfReader),
  { ssr: false },
);
const EpubReader = dynamic(
  () => import("@/components/readers/epub-reader").then((m) => m.EpubReader),
  { ssr: false },
);

export type CommentItem = {
  id: string;
  parentId: string | null;
  annotationId: string | null;
  page: number | null;
  body: string;
  createdAt: string;
  authorId: string;
  authorName: string;
};

type CurrentUser = { id: string; name: string; role: string } | null;

async function submitReport(targetType: "annotation" | "comment", targetId: string) {
  const reason = window.prompt("Что не так с этой записью? Это поможет модератору (необязательно).") ?? "";
  const response = await fetch("/api/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetType, targetId, reason }),
  });
  window.alert(response.ok ? "Спасибо, жалоба отправлена модератору." : "Не получилось отправить жалобу.");
}

export function DocumentWorkspace({
  documentId,
  fileUrl,
  fileType,
  comments,
  annotations,
  currentUser,
  language,
}: {
  documentId: string;
  fileUrl: string | null;
  fileType: string;
  comments: CommentItem[];
  annotations: AnnotationItem[];
  currentUser: CurrentUser;
  /** Primary language of the book — used by the selection dictionary. */
  language?: string | null;
}) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const isPdf = fileType === "PDF";
  const isEpub = fileType === "EPUB";
  const canFullscreen = Boolean(fileUrl) && (isPdf || isEpub);
  const canAnnotate = canAnnotateFiles(currentUser?.role);

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
      <div className={fullscreen ? "fixed inset-0 z-50 flex flex-col bg-paper" : ""}>
        {canFullscreen && (
          <div
            className={
              fullscreen
                ? "flex items-center justify-between border-b border-ink/10 px-4 py-1.5 md:px-8"
                : "mb-3 flex justify-end"
            }
          >
            {fullscreen && (
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
                Полноэкранное чтение · Esc — выйти
              </span>
            )}
            <button
              type="button"
              onClick={() => setFullscreen((f) => !f)}
              className="icon-button"
              aria-label={fullscreen ? "Свернуть на весь экран" : "Развернуть на весь экран"}
              title={fullscreen ? "Свернуть" : "Читать на весь экран"}
            >
              {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          </div>
        )}
        <div className={fullscreen ? "min-h-0 flex-1 overflow-y-auto px-4 pb-12 md:px-8" : ""}>
          {fileUrl && isPdf && (
            <PdfReader
              url={fileUrl}
              page={page}
              onPageChange={(next, total) => {
                setPage(next);
                setNumPages(total);
              }}
              documentId={documentId}
              currentUserId={currentUser?.id ?? null}
              initialAnnotations={annotations}
              comments={annotationComments}
              onReplyToAnnotation={replyToAnnotation}
              onReport={submitReport}
              fullscreen={fullscreen}
              canAnnotate={canAnnotate}
              language={language}
            />
          )}
          {fileUrl && isEpub && (
            <EpubReader
              url={fileUrl}
              page={page}
              onPageChange={(next, total) => {
                setPage(next);
                setNumPages(total);
              }}
              documentId={documentId}
              currentUserId={currentUser?.id ?? null}
              initialAnnotations={annotations}
              comments={annotationComments}
              onReplyToAnnotation={replyToAnnotation}
              onReport={submitReport}
              fullscreen={fullscreen}
              canAnnotate={canAnnotate}
              language={language}
            />
          )}
          {fileUrl && !isPdf && !isEpub && (
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

          <div className="mx-auto mt-10 max-w-3xl space-y-6">
            <CommentThread
              documentId={documentId}
              comments={comments}
              currentUser={currentUser}
              currentPage={isPdf ? page : null}
              maxPage={numPages}
            />
            {annotations.length > 0 && (
              <AnnotationsIndex
                annotations={annotations}
                canJump={isPdf || isEpub}
                onJumpToPage={(target) => setPage(target)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CommentThread({
  documentId,
  comments,
  currentUser,
  currentPage,
  maxPage,
}: {
  documentId: string;
  comments: CommentItem[];
  currentUser: CurrentUser;
  currentPage: number | null;
  maxPage: number;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [attachPage, setAttachPage] = useState(Boolean(currentPage));
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [busy, setBusy] = useState(false);

  // Comments posted as a reply inside a sticker's own discussion belong to
  // that sticker's thread, not the page-level conversation below the reader.
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

  async function postComment(
    text: string,
    page: number | null,
    parentId: string | null,
  ) {
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

  return (
    <aside className="rounded-2xl border border-ink/10 bg-paper p-6">
      <div className="mb-5 flex items-center gap-2">
        <MessageSquare size={17} />
        <h2 className="font-serif text-2xl">Обсуждение</h2>
        <span className="ml-auto font-mono text-xs text-muted">{pageComments.length}</span>
      </div>

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
            placeholder="Поделитесь мыслью об этом тексте…"
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
                Привязать к странице {currentPage}
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

      <div className="space-y-5">
        {topLevel.length === 0 && (
          <p className="text-sm text-muted">Пока никто не написал ни слова — начните вы.</p>
        )}
        {topLevel.map((comment) => (
          <div key={comment.id} className="border-t border-ink/10 pt-4">
            <CommentBubble comment={comment} currentUserId={currentUser?.id ?? null} />
            {(repliesByParent.get(comment.id) ?? []).map((reply) => (
              <div key={reply.id} className="ml-5 mt-3 border-l border-ink/10 pl-4">
                <CommentBubble comment={reply} currentUserId={currentUser?.id ?? null} />
              </div>
            ))}

            {currentUser && (
              <div className="ml-5 mt-2">
                {replyTo === comment.id ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!replyBody.trim()) return;
                      postComment(replyBody.trim(), null, comment.id);
                    }}
                    className="flex items-center gap-2"
                  >
                    <input
                      value={replyBody}
                      onChange={(event) => setReplyBody(event.target.value)}
                      placeholder="Ответить…"
                      className="flex-1 rounded-full border border-ink/15 bg-white/60 px-3 py-1.5 text-sm outline-none focus:border-ink/40 dark:bg-white/5"
                      autoFocus
                    />
                    <button type="submit" className="icon-button" disabled={busy} aria-label="Отправить ответ">
                      <Send size={13} />
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setReplyTo(comment.id)}
                    className="flex items-center gap-1.5 text-xs text-muted hover:text-ink"
                  >
                    <Reply size={13} />
                    Ответить
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}

function CommentBubble({ comment, currentUserId }: { comment: CommentItem; currentUserId: string | null }) {
  return (
    <div className="group">
      <div className="flex items-center gap-2 text-xs text-muted">
        <span className="font-medium text-ink">{comment.authorName}</span>
        {comment.page && (
          <span className="rounded-full bg-ink/5 px-2 py-0.5 font-mono text-[10px]">
            стр. {comment.page}
          </span>
        )}
        <span>{new Date(comment.createdAt).toLocaleDateString("ru-RU")}</span>
        {comment.authorId !== currentUserId && (
          <button
            type="button"
            onClick={() => submitReport("comment", comment.id)}
            className="ml-auto opacity-0 transition-opacity hover:text-rust group-hover:opacity-100"
            aria-label="Пожаловаться на комментарий"
          >
            <TriangleAlert size={12} />
          </button>
        )}
      </div>
      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6">{comment.body}</p>
    </div>
  );
}

/** Bridges stickers scattered across the reader with the discussion below it — filter by who
 * left a mark and where, then jump straight to that page instead of hunting through it. */
function AnnotationsIndex({
  annotations,
  canJump,
  onJumpToPage,
}: {
  annotations: AnnotationItem[];
  canJump: boolean;
  onJumpToPage: (page: number) => void;
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
              стр. {p}
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
        {filtered.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => canJump && onJumpToPage(item.page)}
            disabled={!canJump}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-ink/10 px-3.5 py-2.5 text-left text-sm transition-colors hover:border-rust/40 disabled:cursor-default disabled:hover:border-ink/10"
          >
            <span className="min-w-0 flex-1 truncate">
              <span className="font-medium text-ink">{item.authorName}</span>
              <span className="text-muted">
                {" "}
                ·{" "}
                {item.shape === "drawing"
                  ? "рисунок"
                  : item.shape === "formula"
                    ? item.body
                      ? "формула"
                      : "формула (пусто)"
                    : item.body
                      ? item.body.slice(0, 60)
                      : "без текста"}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5 font-mono text-xs text-muted">
              стр. {item.page}
              {canJump && <ArrowRight size={12} />}
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}
