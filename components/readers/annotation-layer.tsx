"use client";

import { useRef, useEffect, useState } from "react";
import katex from "katex";
import {
  Check,
  Eraser,
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
  Undo2,
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
/** A drawing made directly on the page (not in the small popup pad) is
 * normalized to this square, page-relative canvas — matching how every other
 * annotation coordinate on the page (x/y, anchorRects) is already stored as a
 * 0..1000 fraction of the page's own width/height. */
export const PAGE_DRAWING_VIEWBOX = { w: 1000, h: 1000 };
type DrawingData = { paths: string[]; viewBox: { w: number; h: number }; fullPage?: boolean; strokeWidth?: number };

export type StrokeWidthPreset = "thin" | "medium" | "thick";
/** Absolute stroke widths in each tool's own viewBox units — the small pad
 * (260×150) and the full-page canvas (1000×1000) need very different
 * absolute numbers for "medium" to look like the same relative thickness. */
export const SMALL_STROKE_PRESETS: Record<StrokeWidthPreset, number> = { thin: 1.8, medium: 3.2, thick: 5.5 };
export const PAGE_STROKE_PRESETS: Record<StrokeWidthPreset, number> = { thin: 3.5, medium: 6, thick: 10 };

function parseDrawing(source: string): DrawingData | null {
  try {
    const parsed = JSON.parse(source);
    if (parsed && Array.isArray(parsed.paths) && parsed.viewBox) return parsed as DrawingData;
  } catch {
    /* not a drawing payload */
  }
  return null;
}

/** Where the small pin for a full-page drawing sits — arbitrary (the drawing
 * itself covers the page, not just this point) but consistent, in the same
 * top-right corner a real sticky note tab would sit. */
export const PAGE_DRAWING_PIN = { x: 960, y: 40 };

/** State for an in-progress "draw directly on the page" session, threaded down
 * from `PdfReader` since a two-page spread has two `AnnotationLayer`
 * instances (one per page) sharing one drawing session: `isTarget` says which
 * of the two owns the in-progress strokes and toolbar once the user has
 * actually started drawing on it. */
export type PageDrawSession = {
  /** This page is eligible to start a new drawing, or already owns one. */
  active: boolean;
  /** This specific page instance owns the in-progress strokes/toolbar. */
  isTarget: boolean;
  paths: string[];
  color: string;
  strokeWidthPreset: StrokeWidthPreset;
  visibility: AnnotationVisibility;
  saving: boolean;
  onStart: () => void;
  onPathsChange: (paths: string[]) => void;
  onColorChange: (color: string) => void;
  onStrokeWidthPresetChange: (preset: StrokeWidthPreset) => void;
  onVisibilityChange: (visibility: AnnotationVisibility) => void;
  onCancel: () => void;
  onSave: () => void;
};

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
    <>
      <svg
        viewBox={`0 0 ${data.viewBox.w} ${data.viewBox.h}`}
        preserveAspectRatio={data.fullPage ? "xMidYMid meet" : undefined}
        className="w-full rounded-lg border border-ink/10 bg-ink/[0.02]"
        style={{ height: 150 }}
      >
        {data.paths.map((d, index) => (
          <path
            key={index}
            d={d}
            fill="none"
            stroke={color}
            strokeWidth={data.strokeWidth ?? (data.fullPage ? PAGE_STROKE_PRESETS.medium : SMALL_STROKE_PRESETS.medium)}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
      {data.fullPage && <p className="mt-1.5 text-[11px] text-muted">Рисунок на всей странице — превью уменьшено.</p>}
    </>
  );
}

/** Full-page freehand drawing: a transparent overlay over the whole page that
 * captures pointer strokes directly on top of the rendered text/image,
 * plus a small floating toolbar for colour/undo/clear/visibility/save. This
 * is the primary way to draw on a book — the small pad inside a pin's popup
 * (`DrawingPad`) still exists as a quick, page-independent alternative. */
function PageDrawingLayer({ containerRef, session }: { containerRef: React.RefObject<HTMLDivElement | null>; session: PageDrawSession }) {
  const [liveStroke, setLiveStroke] = useState<string | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const strokeRef = useRef<string | null>(null);

  function toPoint(event: React.PointerEvent<SVGSVGElement>) {
    const rect = containerRef.current!.getBoundingClientRect();
    const x = Math.round(((event.clientX - rect.left) / rect.width) * PAGE_DRAWING_VIEWBOX.w * 10) / 10;
    const y = Math.round(((event.clientY - rect.top) / rect.height) * PAGE_DRAWING_VIEWBOX.h * 10) / 10;
    return { x, y };
  }

  function handlePointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (!session.active) return;
    event.preventDefault();
    (event.target as Element).setPointerCapture(event.pointerId);
    if (!session.isTarget) session.onStart();
    const point = toPoint(event);
    drawingRef.current = true;
    lastPointRef.current = point;
    strokeRef.current = `M ${point.x} ${point.y}`;
    setLiveStroke(strokeRef.current);
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!drawingRef.current) return;
    const point = toPoint(event);
    const last = lastPointRef.current;
    if (last && Math.hypot(point.x - last.x, point.y - last.y) < 3) return;
    lastPointRef.current = point;
    strokeRef.current = strokeRef.current ? `${strokeRef.current} L ${point.x} ${point.y}` : `M ${point.x} ${point.y}`;
    setLiveStroke(strokeRef.current);
  }

  function handlePointerUp() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    const stroke = strokeRef.current;
    strokeRef.current = null;
    setLiveStroke(null);
    if (stroke) session.onPathsChange([...session.paths, stroke]);
  }

  return (
    <>
      <svg
        viewBox={`0 0 ${PAGE_DRAWING_VIEWBOX.w} ${PAGE_DRAWING_VIEWBOX.h}`}
        preserveAspectRatio="none"
        className="pointer-events-auto absolute inset-0 h-full w-full touch-none"
        style={{ cursor: "crosshair" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {session.isTarget &&
          session.paths.map((d, index) => (
            <path
              key={index}
              d={d}
              fill="none"
              stroke={session.color}
              strokeWidth={PAGE_STROKE_PRESETS[session.strokeWidthPreset]}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        {session.isTarget && liveStroke && (
          <path
            d={liveStroke}
            fill="none"
            stroke={session.color}
            strokeWidth={PAGE_STROKE_PRESETS[session.strokeWidthPreset]}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {session.isTarget && (
        <div
          data-annotation-ui
          onClick={(event) => event.stopPropagation()}
          className="pointer-events-auto absolute inset-x-2 bottom-2 z-40 flex flex-wrap items-center gap-2 rounded-xl border border-ink/10 bg-white/95 p-2.5 shadow-lg backdrop-blur"
        >
          <div className="flex items-center gap-1.5">
            {COLOR_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => session.onColorChange(preset)}
                className="size-6 shrink-0 rounded-full"
                style={{
                  backgroundColor: preset,
                  boxShadow: session.color === preset ? `0 0 0 2px white, 0 0 0 4px ${preset}` : undefined,
                }}
                aria-label={preset}
              />
            ))}
          </div>
          <div className="h-5 w-px bg-ink/10" />
          <StrokeWidthPicker
            value={session.strokeWidthPreset}
            onChange={session.onStrokeWidthPresetChange}
            dotColor={session.color}
          />
          <div className="h-5 w-px bg-ink/10" />
          <button
            type="button"
            onClick={() => session.onPathsChange(session.paths.slice(0, -1))}
            disabled={!session.paths.length}
            className="icon-button"
            aria-label="Отменить штрих"
            title="Отменить штрих"
          >
            <Undo2 size={14} />
          </button>
          <button
            type="button"
            onClick={() => session.onPathsChange([])}
            disabled={!session.paths.length}
            className="icon-button"
            aria-label="Очистить"
            title="Очистить"
          >
            <Eraser size={14} />
          </button>
          <div className="hidden h-5 w-px bg-ink/10 sm:block" />
          <div className="hidden items-center rounded-full border border-ink/10 p-0.5 text-xs sm:flex">
            <button
              type="button"
              onClick={() => session.onVisibilityChange("public")}
              className={`rounded-full px-2.5 py-1 transition-colors ${
                session.visibility === "public" ? "bg-ink text-paper" : "text-muted"
              }`}
            >
              Публично
            </button>
            <button
              type="button"
              onClick={() => session.onVisibilityChange("private")}
              className={`rounded-full px-2.5 py-1 transition-colors ${
                session.visibility === "private" ? "bg-ink text-paper" : "text-muted"
              }`}
            >
              Лично
            </button>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <button type="button" onClick={session.onCancel} className="icon-button" aria-label="Отменить рисунок" title="Отмена">
              <X size={14} />
            </button>
            <button
              type="button"
              onClick={session.onSave}
              disabled={session.saving || !session.paths.length}
              className="button-primary px-3 py-1.5 text-xs"
              title="Сохранить рисунок на странице"
            >
              {session.saving ? (
                "Сохраняем…"
              ) : (
                <>
                  <Check size={13} className="mr-1 inline" />
                  Сохранить
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** Three preset dot sizes for picking a stroke thickness — shared by the
 * small pad and the full-page tool so the control looks the same everywhere. */
function StrokeWidthPicker({
  value,
  onChange,
  dotColor,
}: {
  value: StrokeWidthPreset;
  onChange: (preset: StrokeWidthPreset) => void;
  dotColor: string;
}) {
  const presets: { key: StrokeWidthPreset; dot: number; label: string }[] = [
    { key: "thin", dot: 5, label: "Тонко" },
    { key: "medium", dot: 8, label: "Средне" },
    { key: "thick", dot: 12, label: "Толсто" },
  ];
  return (
    <div className="flex items-center gap-0.5">
      {presets.map((preset) => (
        <button
          key={preset.key}
          type="button"
          onClick={() => onChange(preset.key)}
          aria-label={preset.label}
          title={preset.label}
          className={`grid size-7 shrink-0 place-items-center rounded-full border transition-colors ${
            value === preset.key ? "border-ink/40 bg-ink/5" : "border-transparent"
          }`}
        >
          <span className="rounded-full" style={{ width: preset.dot, height: preset.dot, backgroundColor: dotColor }} />
        </button>
      ))}
    </div>
  );
}

/** A tiny freehand sketchpad: pointer strokes are captured as SVG path data, normalized to DRAWING_VIEWBOX. */
function DrawingPad({
  color,
  paths,
  onChange,
  strokeWidthPreset,
  onStrokeWidthPresetChange,
}: {
  color: string;
  paths: string[];
  onChange: (paths: string[]) => void;
  strokeWidthPreset: StrokeWidthPreset;
  onStrokeWidthPresetChange: (preset: StrokeWidthPreset) => void;
}) {
  const strokeWidth = SMALL_STROKE_PRESETS[strokeWidthPreset];
  const svgRef = useRef<SVGSVGElement>(null);
  const [liveStroke, setLiveStroke] = useState<string | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  // Mirrors `liveStroke` outside React state so `handlePointerUp` can read the
  // just-finished stroke synchronously. Reading it via setLiveStroke's own
  // updater function instead (i.e. `setLiveStroke(prev => { onChange(...prev);
  // return null })`) calls the parent's setter from inside this component's
  // own state-update — React flags that as "updating AnnotationLayer while
  // rendering DrawingPad", since updater functions are meant to be pure.
  const strokeRef = useRef<string | null>(null);

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
    strokeRef.current = `M ${point.x} ${point.y}`;
    setLiveStroke(strokeRef.current);
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!drawingRef.current) return;
    const point = toPoint(event);
    const last = lastPointRef.current;
    if (last && Math.hypot(point.x - last.x, point.y - last.y) < 1.5) return;
    lastPointRef.current = point;
    strokeRef.current = strokeRef.current ? `${strokeRef.current} L ${point.x} ${point.y}` : `M ${point.x} ${point.y}`;
    setLiveStroke(strokeRef.current);
  }

  function handlePointerUp() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    const stroke = strokeRef.current;
    strokeRef.current = null;
    setLiveStroke(null);
    if (stroke) onChange([...paths, stroke]);
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
          <path key={index} d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {liveStroke && (
          <path d={liveStroke} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        )}
        {paths.length === 0 && !liveStroke && (
          <text x={DRAWING_VIEWBOX.w / 2} y={DRAWING_VIEWBOX.h / 2} textAnchor="middle" fontSize="11" fill="#9aa1a8">
            Рисуйте здесь
          </text>
        )}
      </svg>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <StrokeWidthPicker value={strokeWidthPreset} onChange={onStrokeWidthPresetChange} dotColor={color} />
        <div className="flex items-center gap-3">
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
  pageDraw,
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
  /** Set (on both pages of a spread) while "draw on the page" mode is on —
   * see `PageDrawSession` for how the two pages coordinate ownership. */
  pageDraw?: PageDrawSession;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ x: number; y: number; anchorText: string | null; anchorRects: AnchorRect[] | null } | null>(null);
  const [shape, setShape] = useState<AnnotationShape>("note");
  const [color, setColor] = useState(COLOR_PRESETS[0]);
  const [text, setText] = useState("");
  const [drawingPaths, setDrawingPaths] = useState<string[]>([]);
  const [drawingStrokeWidth, setDrawingStrokeWidth] = useState<StrokeWidthPreset>("medium");
  const [visibility, setVisibility] = useState<AnnotationVisibility>("public");
  const [allowDiscussion, setAllowDiscussion] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!placing || pageDraw?.active) return;
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
      setDrawingStrokeWidth("medium");
      setVisibility("public");
      setAllowDiscussion(false);
      setOpenId(null);
    }

    container.addEventListener("click", handleContainerClick);
    return () => container.removeEventListener("click", handleContainerClick);
  }, [placing, containerRef, pageDraw?.active]);

  if (pageNumber === null) return null;
  const pageItems = items.filter((item) => item.page === pageNumber);

  async function submitDraft() {
    if (!draft || !pageNumber) return;
    setSaving(true);
    const body =
      shape === "drawing"
        ? JSON.stringify({
            paths: drawingPaths,
            viewBox: DRAWING_VIEWBOX,
            strokeWidth: SMALL_STROKE_PRESETS[drawingStrokeWidth],
          })
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
        const drawingData = item.shape === "drawing" ? parseDrawing(item.body) : null;

        return (
          <div key={item.id}>
            {/* A page-spanning drawing renders as an always-visible overlay —
                like real ink on the page — separately from its small pin
                (below), which only exists so it can still be opened/reported/
                deleted like any other annotation. */}
            {drawingData?.fullPage && drawingData.paths.length > 0 && (
              <svg
                viewBox={`0 0 ${drawingData.viewBox.w} ${drawingData.viewBox.h}`}
                preserveAspectRatio="none"
                className="pointer-events-none absolute inset-0 h-full w-full"
              >
                {drawingData.paths.map((d, index) => (
                  <path
                    key={index}
                    d={d}
                    fill="none"
                    stroke={item.color}
                    strokeWidth={drawingData.strokeWidth ?? PAGE_STROKE_PRESETS.medium}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    opacity={0.92}
                  />
                ))}
              </svg>
            )}
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
                  className={`absolute top-full z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] max-h-[60vh] overflow-y-auto rounded-xl border border-ink/10 bg-white p-3.5 text-left shadow-xl ${
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
          className="sticker-pop pointer-events-auto absolute z-30 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-ink/10 bg-white p-4 text-left shadow-xl"
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
            <>
              <p className="mb-2 text-[11px] text-muted">
                Здесь — маленький набросок для этой пометки. Чтобы рисовать прямо по странице, закройте это окно и нажмите «Рисовать на странице» в панели читалки.
              </p>
              <DrawingPad
                color={color}
                paths={drawingPaths}
                onChange={setDrawingPaths}
                strokeWidthPreset={drawingStrokeWidth}
                onStrokeWidthPresetChange={setDrawingStrokeWidth}
              />
            </>
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

      {pageDraw?.active && <PageDrawingLayer containerRef={containerRef} session={pageDraw} />}
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
