"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { MessageSquare, Reply, Send } from "lucide-react";

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
  page: number | null;
  body: string;
  createdAt: string;
  authorName: string;
};

type CurrentUser = { id: string; name: string } | null;

export function DocumentWorkspace({
  documentId,
  fileUrl,
  fileType,
  comments,
  currentUser,
}: {
  documentId: string;
  fileUrl: string | null;
  fileType: string;
  comments: CommentItem[];
  currentUser: CurrentUser;
}) {
  const [page, setPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const isPdf = fileType === "PDF";
  const isEpub = fileType === "EPUB";

  return (
    <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr]">
      <div>
        {fileUrl && isPdf && (
          <PdfReader
            url={fileUrl}
            page={page}
            onPageChange={(next, total) => {
              setPage(next);
              setNumPages(total);
            }}
          />
        )}
        {fileUrl && isEpub && <EpubReader url={fileUrl} />}
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
      </div>

      <CommentThread
        documentId={documentId}
        comments={comments}
        currentUser={currentUser}
        currentPage={isPdf ? page : null}
        maxPage={numPages}
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

  const topLevel = useMemo(() => comments.filter((c) => !c.parentId), [comments]);
  const repliesByParent = useMemo(() => {
    const map = new Map<string, CommentItem[]>();
    for (const comment of comments) {
      if (!comment.parentId) continue;
      const list = map.get(comment.parentId) ?? [];
      list.push(comment);
      map.set(comment.parentId, list);
    }
    return map;
  }, [comments]);

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
        <span className="ml-auto font-mono text-xs text-muted">{comments.length}</span>
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
            className="w-full rounded-xl border border-ink/15 bg-white/60 p-3 text-sm outline-none focus:border-ink/40"
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
            <CommentBubble comment={comment} />
            {(repliesByParent.get(comment.id) ?? []).map((reply) => (
              <div key={reply.id} className="ml-5 mt-3 border-l border-ink/10 pl-4">
                <CommentBubble comment={reply} />
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
                      className="flex-1 rounded-full border border-ink/15 bg-white/60 px-3 py-1.5 text-sm outline-none focus:border-ink/40"
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

function CommentBubble({ comment }: { comment: CommentItem }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-xs text-muted">
        <span className="font-medium text-ink">{comment.authorName}</span>
        {comment.page && (
          <span className="rounded-full bg-ink/5 px-2 py-0.5 font-mono text-[10px]">
            стр. {comment.page}
          </span>
        )}
        <span>{new Date(comment.createdAt).toLocaleDateString("ru-RU")}</span>
      </div>
      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6">{comment.body}</p>
    </div>
  );
}
