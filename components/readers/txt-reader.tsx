/**
 * Paginated plain-text reader with dictionary, stickers, hide-marks, and bookmarks.
 * Long TXT files are split into stable "листы" so annotations and discussion
 * can bind to a page the same way as PDF/EPUB.
 */
"use client";

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
} from "lucide-react";
import {
  AnnotationLayer,
  type AnnotationCommentItem,
  type AnnotationDraft,
  type AnnotationItem,
  type AnnotationUpdate,
} from "./annotation-layer";
import { PageJumpInput } from "./page-jump-input";
import { ReaderToc } from "./reader-toc";
import { SelectionLookup } from "./selection-lookup";
import { addBookmark } from "@/lib/bookmarks";
import { splitTxtPages, txtTableOfContents } from "@/lib/txt-structure";

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
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const numPagesNotified = useRef(0);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [annotations, setAnnotations] = useState(initialAnnotations);
  const [placing, setPlacing] = useState(false);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [bookmarkFlash, setBookmarkFlash] = useState(false);

  useEffect(() => {
    setAnnotations(initialAnnotations);
  }, [initialAnnotations]);

  useEffect(() => {
    let cancelled = false;
    setText(null);
    setError(false);
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        const buf = await res.arrayBuffer();
        let decoded = new TextDecoder("utf-8", { fatal: false }).decode(buf);
        if (decoded.includes("\uFFFD") && buf.byteLength < 8_000_000) {
          decoded = new TextDecoder("latin1").decode(buf);
        }
        if (decoded.charCodeAt(0) === 0xfeff) decoded = decoded.slice(1);
        if (!cancelled) setText(decoded);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  const [tocOpen, setTocOpen] = useState(true);
  const pages = useMemo(() => (text == null ? [] : splitTxtPages(text)), [text]);
  const toc = useMemo(() => txtTableOfContents(pages), [pages]);
  const total = pages.length;
  const safePage = total > 0 ? Math.min(Math.max(1, page), total) : 1;
  const pageText = pages[safePage - 1] ?? "";
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;

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
                  ? patch.allowDiscussion
                  : item.allowDiscussion,
            }
          : item,
      ),
    );
    await fetch(`/api/annotations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  function go(delta: -1 | 1) {
    if (!total || !onPageChange) return;
    onPageChange(Math.min(total, Math.max(1, safePage + delta)), total);
    scrollRef.current?.scrollTo({ top: 0 });
  }

  function jumpToPage(target: number) {
    if (!total || !onPageChange) return;
    onPageChange(Math.min(total, Math.max(1, target)), total);
    scrollRef.current?.scrollTo({ top: 0 });
  }

  function bookmarkHere() {
    if (!documentId || !total) return;
    addBookmark(documentId, safePage);
    setBookmarkFlash(true);
    window.setTimeout(() => setBookmarkFlash(false), 1200);
    window.dispatchEvent(new CustomEvent("blabla:bookmarks-changed", { detail: { documentId } }));
  }

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
          ? "rounded-2xl border border-ink/10 bg-ink/[0.02] p-2 md:p-3"
          : "rounded-2xl border border-ink/10 bg-ink/[0.02] p-4 md:p-6"
      }
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
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
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs ${
                tocOpen ? "border-rust text-rust" : "border-ink/15 text-muted hover:text-ink"
              }`}
              aria-label="Оглавление"
              title="Оглавление"
            >
              <List size={14} />
              Оглавление
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => setShowAnnotations((v) => !v)}
            className={`icon-button ${!showAnnotations ? "border-rust text-rust" : ""}`}
            aria-label={showAnnotations ? "Скрыть пометки" : "Показать пометки"}
            title={showAnnotations ? "Скрыть пометки" : "Показать пометки"}
          >
            {showAnnotations ? <Eye size={14} /> : <EyeOff size={14} />}
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

      {placing && (
        <p className="mb-3 rounded-lg bg-rust/10 px-3 py-2 text-xs text-rust">
          Можно выделить фрагмент, затем кликните в нужном месте листа.
        </p>
      )}

      <div className="md:flex md:items-start md:gap-3">
        <ReaderToc
          open={Boolean(tocOpen && text != null)}
          items={toc.map((item, i) => ({
            id: `${item.page}-${i}`,
            label: item.title,
            hint: item.kind === "contents" ? undefined : `лист ${item.page}`,
            kind: item.kind,
            active: item.page === safePage,
          }))}
          empty="В этом файле нет явных заголовков глав или песней. Листы экрана не равны песням Гомера — не выдумываем оглавление из пустого текста."
          onSelect={(id) => {
            const page = Number.parseInt(id, 10);
            if (Number.isFinite(page)) jumpToPage(page);
          }}
        />
        <div className="min-w-0 flex-1">
      {total > 0 && (
        <div className={`${fullscreen ? "mb-2" : "mb-4"} h-1 w-full overflow-hidden rounded-full bg-ink/10`}>
          <div
            className="h-full rounded-full bg-rust transition-[width] duration-300 ease-out"
            style={{ width: `${(safePage / total) * 100}%` }}
          />
        </div>
      )}

      <div className="relative">
        <div
          ref={scrollRef}
          className="overflow-y-auto rounded-xl bg-paper"
          style={{ maxHeight: fullscreen ? "calc(100vh - 8rem)" : "70vh" }}
        >
          <div
            ref={contentRef}
            className={`relative px-5 py-6 md:px-10 md:py-8 ${placing ? "cursor-crosshair" : ""}`}
          >
            {text == null ? (
              <div className="grid place-items-center py-20">
                <Loader2 className="animate-spin text-muted" />
              </div>
            ) : (
              <pre className="whitespace-pre-wrap break-words font-serif text-[15px] leading-7 text-ink md:text-base md:leading-8">
                {pageText}
              </pre>
            )}
            {text != null && documentId && (
              <AnnotationLayer
                pageNumber={safePage}
                items={annotations}
                containerRef={contentRef}
                currentUserId={currentUserId ?? null}
                placing={placing}
                comments={comments}
                onCreate={createAnnotation}
                onDelete={deleteAnnotation}
                onUpdate={updateAnnotation}
                onReply={onReplyToAnnotation ?? (() => {})}
                onReport={onReport ?? (() => {})}
                onPlaced={() => setPlacing(false)}
                hidden={!showAnnotations}
              />
            )}
            <SelectionLookup containerRef={contentRef} language={language} suppressed={placing} />
          </div>
        </div>
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={safePage <= 1 || placing}
          aria-label="Предыдущий лист"
          className="group absolute inset-y-0 left-0 z-10 hidden w-14 items-center justify-start disabled:cursor-default md:flex"
        >
          <span className="ml-1 grid size-11 place-items-center rounded-full border border-ink/10 bg-paper/90 text-muted opacity-0 shadow-sm transition-all group-hover:opacity-100 group-disabled:!opacity-0 group-hover:border-ink/20 group-hover:text-ink">
            <ChevronLeft size={20} />
          </span>
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={safePage >= total || placing}
          aria-label="Следующий лист"
          className="group absolute inset-y-0 right-0 z-10 hidden w-14 items-center justify-end disabled:cursor-default md:flex"
        >
          <span className="mr-1 grid size-11 place-items-center rounded-full border border-ink/10 bg-paper/90 text-muted opacity-0 shadow-sm transition-all group-hover:opacity-100 group-disabled:!opacity-0 group-hover:border-ink/20 group-hover:text-ink">
            <ChevronRight size={20} />
          </span>
        </button>
      </div>
        </div>
      </div>
    </div>
  );
}
