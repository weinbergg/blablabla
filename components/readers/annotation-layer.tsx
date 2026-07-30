"use client";

import { useRef, useEffect, useState } from "react";
import katex from "katex";
import {
  Flag,
  Heart,
  HelpCircle,
  MessageCircle,
  Pencil,
  Quote,
  Send,
  Sigma,
  Star,
  StickyNote,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";

export type AnnotationShape =
  | "note"
  | "star"
  | "flag"
  | "question"
  | "heart"
  | "quote"
  | "formula"
  | "drawing";
export type AnnotationVisibility = "public" | "private";
export type AnchorRect = { x: number; y: number; w: number; h: number };

export type AnnotationItem = {
  id: string;
  authorId: string;
  authorName: string;
  page: number;
  x: number;
  y: number;
  shape: AnnotationShape;
  color: string;
  body: string;
  visibility: AnnotationVisibility;
  allowDiscussion: boolean;
  anchorText: string | null;
  anchorRects: AnchorRect[] | null;
  createdAt: string;
};

export type AnnotationDraft = {
  page: number;
  x: number;
  y: number;
  shape: AnnotationShape;
  color: string;
  body: string;
  visibility: AnnotationVisibility;
  allowDiscussion: boolean;
  anchorText: string | null;
  anchorRects: AnchorRect[] | null;
};

export type AnnotationCommentItem = {
  id: string;
  annotationId: string | null;
  body: string;
  createdAt: string;
  authorId: string;
  authorName: string;
};

const SHAPE_ICONS: Record<AnnotationShape, typeof StickyNote> = {
  note: StickyNote,
  star: Star,
  flag: Flag,
  question: HelpCircle,
  heart: Heart,
  quote: Quote,
  formula: Sigma,
  drawing: Pencil,
};

export const COLOR_PRESETS = ["#c85c35", "#8a5a9e", "#2f6f4f", "#1d5b8a", "#b8860b", "#17202c"];

/** Fixed logical canvas that a freehand drawing is normalized to, so it stays crisp at any zoom level. */
export const DRAWING_VIEWBOX = { w: 260, h: 150 };
type DrawingData = { paths: string[]; viewBox: typeof DRAWING_VIEWBOX };

function parseDrawing(source: string): DrawingData | null {
  try {
    const parsed = JSON.parse(source);
    if (parsed && Array.isArray(parsed.paths) && parsed.viewBox) return parsed as DrawingData;
  } catch {
    /* not a drawing payload */
  }
  return null;
}

function clampInt(value: number) {
  return Math.min(1000, Math.max(0, value));
}

/** Reads the current text selection, if any, as a set of page-normalized (0..1000) rects — used to anchor a sticker to a specific passage. */
function captureSelectionAnchor(container: HTMLElement): { text: string; rects: AnchorRect[] } | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;

  const text = selection.toString().trim();
  if (!text) return null;

  const containerRect = container.getBoundingClientRect();
  if (!containerRect.width || !containerRect.height) return null;

  const rects: AnchorRect[] = Array.from(range.getClientRects())
    .map((r) => ({
      x: clampInt(((r.left - containerRect.left) / containerRect.width) * 1000),
      y: clampInt(((r.top - containerRect.top) / containerRect.height) * 1000),
      w: clampInt((r.width / containerRect.width) * 1000),
      h: clampInt((r.height / containerRect.height) * 1000),
    }))
    .filter((r) => r.w > 0 && r.h > 0);

  return rects.length ? { text: text.slice(0, 600), rects } : null;
}

function FormulaBody({ source }: { source: string }) {
  const html = katex.renderToString(source, { throwOnError: false, displayMode: true });
  return <div className="overflow-x-auto py-1 text-sm" dangerouslySetInnerHTML={{ __html: html }} />;
}

function DrawingBody({ source, color }: { source: string; color: string }) {
  const data = parseDrawing(source);
  if (!data || data.paths.length === 0) {
    return <p className="text-sm italic text-muted">Пустой рисунок</p>;
  }
  return (
    <svg
      viewBox={`0 0 ${data.viewBox.w} ${data.viewBox.h}`}
      className="w-full rounded-lg border border-ink/10 bg-ink/[0.02]"
      style={{ height: 150 }}
    >
      {data.paths.map((d, index) => (
        <path key={index} d={d} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}

/** A tiny freehand sketchpad: pointer strokes are captured as SVG path data, normalized to DRAWING_VIEWBOX. */
function DrawingPad({
  color,
  paths,
  onChange,
}: {
  color: string;
  paths: string[];
  onChange: (paths: string[]) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [liveStroke, setLiveStroke] = useState<string | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  function toPoint(event: React.PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = Math.round(((event.clientX - rect.left) / rect.width) * DRAWING_VIEWBOX.w * 10) / 10;
    const y = Math.round(((event.clientY - rect.top) / rect.height) * DRAWING_VIEWBOX.h * 10) / 10;
    return { x, y };
  }

  function handlePointerDown(event: React.PointerEvent<SVGSVGElement>) {
    event.preventDefault();
    (event.target as Element).setPointerCapture(event.pointerId);
    const point = toPoint(event);
    drawingRef.current = true;
    lastPointRef.current = point;
    setLiveStroke(`M ${point.x} ${point.y}`);
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!drawingRef.current) return;
    const point = toPoint(event);
    const last = lastPointRef.current;
    if (last && Math.hypot(point.x - last.x, point.y - last.y) < 1.5) return;
    lastPointRef.current = point;
    setLiveStroke((prev) => (prev ? `${prev} L ${point.x} ${point.y}` : `M ${point.x} ${point.y}`));
  }

  function handlePointerUp() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    setLiveStroke((prev) => {
      if (prev) onChange([...paths, prev]);
      return null;
    });
  }

  return (
    <div className="mb-3">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${DRAWING_VIEWBOX.w} ${DRAWING_VIEWBOX.h}`}
        className="w-full touch-none rounded-lg border border-ink/15 bg-ink/[0.02]"
        style={{ height: 150 }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {paths.map((d, index) => (
          <path key={index} d={d} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {liveStroke && (
          <path d={liveStroke} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        )}
        {paths.length === 0 && !liveStroke && (
          <text x={DRAWING_VIEWBOX.w / 2} y={DRAWING_VIEWBOX.h / 2} textAnchor="middle" fontSize="11" fill="#9aa1a8">
            Рисуйте здесь
          </text>
        )}
      </svg>
      <div className="mt-1.5 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => onChange(paths.slice(0, -1))}
          disabled={!paths.length}
          className="text-[11px] text-muted hover:text-ink disabled:opacity-40"
        >
          Отменить штрих
        </button>
        <button
          type="button"
          onClick={() => onChange([])}
          disabled={!paths.length}
          className="text-[11px] text-muted hover:text-rust disabled:opacity-40"
        >
          Очистить
        </button>
      </div>
    </div>
  );
}

export function AnnotationLayer({
  pageNumber,
  items,
  currentUserId,
  placing,
  containerRef,
  comments,
  onCreate,
  onDelete,
  onReply,
  onReport,
  onPlaced,
}: {
  pageNumber: number | null;
  items: AnnotationItem[];
  currentUserId: string | null;
  placing: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  comments: AnnotationCommentItem[];
  onCreate: (draft: AnnotationDraft) => Promise<void> | void;
  onDelete: (id: string) => void;
  onReply: (annotationId: string, body: string) => Promise<void> | void;
  onReport: (targetType: "annotation" | "comment", targetId: string) => void;
  onPlaced: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ x: number; y: number; anchorText: string | null; anchorRects: AnchorRect[] | null } | null>(null);
  const [shape, setShape] = useState<AnnotationShape>("note");
  const [color, setColor] = useState(COLOR_PRESETS[0]);
  const [text, setText] = useState("");
  const [drawingPaths, setDrawingPaths] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<AnnotationVisibility>("public");
  const [allowDiscussion, setAllowDiscussion] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!placing) return;
    const container = containerRef.current;
    if (!container) return;

    function handleContainerClick(event: MouseEvent) {
      // This is a plain DOM listener on the page container, so it fires during
      // the native bubble *before* React gets a chance to run any of our own
      // onClick handlers (which live on a delegated listener much higher up
      // the tree) — including a popup's own stopPropagation(). Without this
      // guard, clicking anything inside the draft form or an open sticker
      // popup (shape icon, checkbox, reply box...) would also be treated as
      // "place a new sticker here" and wipe out whatever was being edited.
      if ((event.target as Element | null)?.closest("[data-annotation-ui]")) return;
      const rect = container!.getBoundingClientRect();
      const x = Math.round(((event.clientX - rect.left) / rect.width) * 1000);
      const y = Math.round(((event.clientY - rect.top) / rect.height) * 1000);
      const anchor = captureSelectionAnchor(container!);
      setDraft({
        x: clampInt(x),
        y: clampInt(y),
        anchorText: anchor?.text ?? null,
        anchorRects: anchor?.rects ?? null,
      });
      setShape("note");
      setColor(COLOR_PRESETS[0]);
      setText("");
      setDrawingPaths([]);
      setVisibility("public");
      setAllowDiscussion(false);
      setOpenId(null);
    }

    container.addEventListener("click", handleContainerClick);
    return () => container.removeEventListener("click", handleContainerClick);
  }, [placing, containerRef]);

  if (pageNumber === null) return null;
  const pageItems = items.filter((item) => item.page === pageNumber);

  async function submitDraft() {
    if (!draft || !pageNumber) return;
    setSaving(true);
    const body =
      shape === "drawing"
        ? JSON.stringify({ paths: drawingPaths, viewBox: DRAWING_VIEWBOX })
        : text.trim();
    await onCreate({
      page: pageNumber,
      x: draft.x,
      y: draft.y,
      shape,
      color,
      body,
      visibility,
      allowDiscussion: visibility === "public" && allowDiscussion,
      anchorText: draft.anchorText,
      anchorRects: draft.anchorRects,
    });
    setSaving(false);
    setDraft(null);
    onPlaced();
  }

  return (
    <div className="pointer-events-none absolute inset-0">
      {pageItems.map((item) => {
        const Icon = SHAPE_ICONS[item.shape];
        const isOwn = item.authorId === currentUserId;
        const flip = item.x > 600;
        const isOpen = openId === item.id;
        const thread = comments.filter((c) => c.annotationId === item.id);

        return (
          <div key={item.id}>
            {isOpen && item.anchorRects && item.anchorRects.length > 0 && (
              <div className="pointer-events-none absolute inset-0">
                {item.anchorRects.map((rect, index) => (
                  <div
                    key={index}
                    className="sticker-pop absolute rounded-sm"
                    style={{
                      left: `${rect.x / 10}%`,
                      top: `${rect.y / 10}%`,
                      width: `${rect.w / 10}%`,
                      height: `${rect.h / 10}%`,
                      backgroundColor: `${item.color}33`,
                      outline: `1.5px solid ${item.color}88`,
                    }}
                  />
                ))}
              </div>
            )}
            <div
              className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${item.x / 10}%`, top: `${item.y / 10}%` }}
            >
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setDraft(null);
                  setOpenId((current) => (current === item.id ? null : item.id));
                }}
                className="sticker-pop grid size-8 place-items-center rounded-full border-2 border-white shadow-md transition-transform hover:scale-110"
                style={{ backgroundColor: item.color }}
                aria-label="Пометка"
              >
                <Icon size={14} className="text-white" />
              </button>

              {isOpen && (
                <div
                  data-annotation-ui
                  onClick={(event) => event.stopPropagation()}
                  className={`absolute top-full z-20 mt-2 w-72 max-h-[60vh] overflow-y-auto rounded-xl border border-ink/10 bg-white p-3.5 text-left shadow-xl ${
                    flip ? "right-0" : "left-0"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between text-xs text-muted">
                    <span className="font-medium text-ink">{item.authorName}</span>
                    <span>{item.visibility === "private" ? "лично" : "публично"}</span>
                  </div>
                  {item.anchorText && (
                    <p className="mb-2 border-l-2 border-ink/15 pl-2 text-xs italic text-muted">
                      «{item.anchorText}»
                    </p>
                  )}
                  {item.shape === "formula" ? (
                    item.body ? (
                      <FormulaBody source={item.body} />
                    ) : (
                      <p className="text-sm italic text-muted">Формула не введена</p>
                    )
                  ) : item.shape === "drawing" ? (
                    <DrawingBody source={item.body} color={item.color} />
                  ) : item.body ? (
                    <p className="whitespace-pre-wrap text-sm leading-6">{item.body}</p>
                  ) : (
                    <p className="text-sm italic text-muted">Без текста</p>
                  )}

                  <div className="mt-2 flex items-center justify-between border-t border-ink/10 pt-2">
                    {!isOwn && (
                      <button
                        type="button"
                        onClick={() => onReport("annotation", item.id)}
                        className="flex items-center gap-1 text-[11px] text-muted hover:text-rust"
                      >
                        <TriangleAlert size={11} />
                        Пожаловаться
                      </button>
                    )}
                    {isOwn && (
                      <button
                        type="button"
                        onClick={() => {
                          onDelete(item.id);
                          setOpenId(null);
                        }}
                        className="flex items-center gap-1 text-xs text-muted hover:text-rust"
                      >
                        <Trash2 size={12} />
                        Удалить
                      </button>
                    )}
                  </div>

                  {item.visibility === "public" && item.allowDiscussion && (
                    <AnnotationDiscussion
                      annotationId={item.id}
                      thread={thread}
                      currentUserId={currentUserId}
                      canReply={Boolean(currentUserId)}
                      onReply={onReply}
                      onReport={onReport}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {draft && (
        <div
          data-annotation-ui
          onClick={(event) => event.stopPropagation()}
          className="sticker-pop pointer-events-auto absolute z-30 w-72 rounded-xl border border-ink/10 bg-white p-4 text-left shadow-xl"
          style={{
            left: `${Math.min(draft.x / 10, 72)}%`,
            top: `${Math.min(draft.y / 10, 65)}%`,
          }}
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted">
              Новая пометка
            </span>
            <button
              type="button"
              onClick={() => {
                setDraft(null);
                onPlaced();
              }}
              className="grid size-6 place-items-center rounded-full text-muted hover:text-ink"
              aria-label="Отмена"
            >
              <X size={13} />
            </button>
          </div>

          {draft.anchorText && (
            <p className="mb-3 rounded-lg bg-ink/5 px-2.5 py-2 text-xs italic text-muted">
              Привязано к тексту: «{draft.anchorText.slice(0, 120)}
              {draft.anchorText.length > 120 ? "…" : ""}»
            </p>
          )}

          <div className="mb-3 flex flex-wrap gap-1.5">
            {(Object.keys(SHAPE_ICONS) as AnnotationShape[]).map((key) => {
              const Icon = SHAPE_ICONS[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setShape(key)}
                  className={`grid size-8 place-items-center rounded-lg border transition-colors ${
                    shape === key ? "border-ink bg-ink text-paper" : "border-ink/15 text-muted hover:border-ink/40"
                  }`}
                  aria-label={key}
                >
                  <Icon size={14} />
                </button>
              );
            })}
          </div>

          <div className="mb-3 flex gap-1.5">
            {COLOR_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setColor(preset)}
                className="size-6 rounded-full"
                style={{
                  backgroundColor: preset,
                  boxShadow: color === preset ? `0 0 0 2px white, 0 0 0 4px ${preset}` : undefined,
                }}
                aria-label={preset}
              />
            ))}
          </div>

          {shape === "drawing" ? (
            <DrawingPad color={color} paths={drawingPaths} onChange={setDrawingPaths} />
          ) : (
            <>
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={
                  shape === "formula"
                    ? "Формула в LaTeX, например \\int_0^1 x^2\\,dx"
                    : "Что стоит отметить на этой странице?"
                }
                rows={3}
                className={`mb-3 w-full rounded-lg border border-ink/15 p-2.5 text-sm outline-none focus:border-ink/40 ${
                  shape === "formula" ? "font-mono" : ""
                }`}
              />
              {shape === "formula" && text.trim() && (
                <div className="mb-3 rounded-lg border border-ink/10 bg-ink/[0.02] px-2">
                  <FormulaBody source={text.trim()} />
                </div>
              )}
            </>
          )}

          <div className="mb-3 flex items-center rounded-full border border-ink/10 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setVisibility("public")}
              className={`flex-1 rounded-full px-2 py-1.5 transition-colors ${
                visibility === "public" ? "bg-ink text-paper" : "text-muted"
              }`}
            >
              Публично
            </button>
            <button
              type="button"
              onClick={() => setVisibility("private")}
              className={`flex-1 rounded-full px-2 py-1.5 transition-colors ${
                visibility === "private" ? "bg-ink text-paper" : "text-muted"
              }`}
            >
              Лично
            </button>
          </div>

          {visibility === "public" && (
            <label className="mb-3 flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={allowDiscussion}
                onChange={(event) => setAllowDiscussion(event.target.checked)}
              />
              Разрешить обсуждение под этой пометкой
            </label>
          )}

          <button type="button" onClick={submitDraft} disabled={saving} className="button-primary w-full">
            {saving ? "Сохраняем…" : "Сохранить"}
          </button>
        </div>
      )}
    </div>
  );
}

function AnnotationDiscussion({
  annotationId,
  thread,
  currentUserId,
  canReply,
  onReply,
  onReport,
}: {
  annotationId: string;
  thread: AnnotationCommentItem[];
  currentUserId: string | null;
  canReply: boolean;
  onReply: (annotationId: string, body: string) => Promise<void> | void;
  onReport: (targetType: "annotation" | "comment", targetId: string) => void;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="mt-3 border-t border-ink/10 pt-3">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted">
        <MessageCircle size={11} />
        Обсуждение · {thread.length}
      </p>
      {thread.length > 0 && (
        <div className="mb-2 space-y-2.5">
          {thread.map((comment) => (
            <div key={comment.id} className="group text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-ink">{comment.authorName}</span>
                {comment.authorId !== currentUserId && (
                  <button
                    type="button"
                    onClick={() => onReport("comment", comment.id)}
                    className="opacity-0 transition-opacity group-hover:opacity-100 text-muted hover:text-rust"
                    aria-label="Пожаловаться на комментарий"
                  >
                    <TriangleAlert size={10} />
                  </button>
                )}
              </div>
              <p className="mt-0.5 whitespace-pre-wrap leading-5 text-ink/80">{comment.body}</p>
            </div>
          ))}
        </div>
      )}
      {canReply ? (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (!body.trim()) return;
            setBusy(true);
            await onReply(annotationId, body.trim());
            setBusy(false);
            setBody("");
          }}
          className="flex items-center gap-1.5"
        >
          <input
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Ответить…"
            className="flex-1 rounded-full border border-ink/15 px-3 py-1.5 text-xs outline-none focus:border-ink/40"
          />
          <button type="submit" disabled={busy} className="icon-button" aria-label="Отправить">
            <Send size={12} />
          </button>
        </form>
      ) : (
        <p className="text-[11px] text-muted">
          <a href="/login" className="underline">
            Войдите
          </a>
          , чтобы ответить.
        </p>
      )}
    </div>
  );
}
