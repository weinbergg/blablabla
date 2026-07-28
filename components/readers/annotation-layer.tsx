"use client";

import { useState } from "react";
import { Flag, Heart, HelpCircle, Quote, Star, StickyNote, Trash2, X } from "lucide-react";

export type AnnotationShape = "note" | "star" | "flag" | "question" | "heart" | "quote";
export type AnnotationVisibility = "public" | "private";

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
};

const SHAPE_ICONS: Record<AnnotationShape, typeof StickyNote> = {
  note: StickyNote,
  star: Star,
  flag: Flag,
  question: HelpCircle,
  heart: Heart,
  quote: Quote,
};

export const COLOR_PRESETS = ["#c85c35", "#8a5a9e", "#2f6f4f", "#1d5b8a", "#b8860b", "#17202c"];

function clampInt(value: number) {
  return Math.min(1000, Math.max(0, value));
}

export function AnnotationLayer({
  pageNumber,
  items,
  currentUserId,
  placing,
  onCreate,
  onDelete,
  onPlaced,
}: {
  pageNumber: number | null;
  items: AnnotationItem[];
  currentUserId: string | null;
  placing: boolean;
  onCreate: (draft: AnnotationDraft) => Promise<void> | void;
  onDelete: (id: string) => void;
  onPlaced: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null);
  const [shape, setShape] = useState<AnnotationShape>("note");
  const [color, setColor] = useState(COLOR_PRESETS[0]);
  const [text, setText] = useState("");
  const [visibility, setVisibility] = useState<AnnotationVisibility>("public");
  const [saving, setSaving] = useState(false);

  if (pageNumber === null) return null;
  const pageItems = items.filter((item) => item.page === pageNumber);

  function handleClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!placing) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.round(((event.clientX - rect.left) / rect.width) * 1000);
    const y = Math.round(((event.clientY - rect.top) / rect.height) * 1000);
    setDraft({ x: clampInt(x), y: clampInt(y) });
    setShape("note");
    setColor(COLOR_PRESETS[0]);
    setText("");
    setVisibility("public");
    setOpenId(null);
  }

  async function submitDraft() {
    if (!draft || !pageNumber) return;
    setSaving(true);
    await onCreate({ page: pageNumber, x: draft.x, y: draft.y, shape, color, body: text.trim(), visibility });
    setSaving(false);
    setDraft(null);
    onPlaced();
  }

  return (
    <div className={`absolute inset-0 ${placing ? "cursor-crosshair" : ""}`} onClick={handleClick}>
      {pageItems.map((item) => {
        const Icon = SHAPE_ICONS[item.shape];
        const isOwn = item.authorId === currentUserId;
        const flip = item.x > 600;
        return (
          <div
            key={item.id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
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

            {openId === item.id && (
              <div
                onClick={(event) => event.stopPropagation()}
                className={`absolute top-full z-20 mt-2 w-64 rounded-xl border border-ink/10 bg-white p-3.5 text-left shadow-xl ${
                  flip ? "right-0" : "left-0"
                }`}
              >
                <div className="mb-2 flex items-center justify-between text-xs text-muted">
                  <span className="font-medium text-ink">{item.authorName}</span>
                  <span>{item.visibility === "private" ? "лично" : "публично"}</span>
                </div>
                {item.body ? (
                  <p className="whitespace-pre-wrap text-sm leading-6">{item.body}</p>
                ) : (
                  <p className="text-sm italic text-muted">Без текста</p>
                )}
                {isOwn && (
                  <div className="mt-3 flex justify-end border-t border-ink/10 pt-2">
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
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {draft && (
        <div
          onClick={(event) => event.stopPropagation()}
          className="sticker-pop absolute z-30 w-72 rounded-xl border border-ink/10 bg-white p-4 text-left shadow-xl"
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

          <div className="mb-3 flex gap-1.5">
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

          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Что стоит отметить на этой странице?"
            rows={3}
            className="mb-3 w-full rounded-lg border border-ink/15 p-2.5 text-sm outline-none focus:border-ink/40"
          />

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

          <button type="button" onClick={submitDraft} disabled={saving} className="button-primary w-full">
            {saving ? "Сохраняем…" : "Сохранить"}
          </button>
        </div>
      )}
    </div>
  );
}
