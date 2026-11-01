export type MarkPoint = { x: number; y: number };

export type AttachmentMarks = {
  crop: { x: number; y: number; w: number; h: number } | null;
  strokes: { color: string; width: number; points: MarkPoint[] }[];
  notes: { id: string; x: number; y: number; text: string }[];
};

export const EMPTY_MARKS: AttachmentMarks = {
  crop: null,
  strokes: [],
  notes: [],
};

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function parseMarks(raw: unknown): AttachmentMarks {
  if (!raw || typeof raw !== "object") return { ...EMPTY_MARKS, strokes: [], notes: [] };
  const data = raw as Partial<AttachmentMarks>;
  const crop =
    data.crop &&
    typeof data.crop.x === "number" &&
    typeof data.crop.y === "number" &&
    typeof data.crop.w === "number" &&
    typeof data.crop.h === "number"
      ? {
          x: clamp01(data.crop.x),
          y: clamp01(data.crop.y),
          w: Math.min(1 - clamp01(data.crop.x), Math.max(0.04, data.crop.w)),
          h: Math.min(1 - clamp01(data.crop.y), Math.max(0.04, data.crop.h)),
        }
      : null;
  const strokes = Array.isArray(data.strokes)
    ? data.strokes
        .slice(0, 40)
        .map((stroke) => ({
          color: typeof stroke?.color === "string" ? stroke.color.slice(0, 20) : "#c85c35",
          width: Math.min(12, Math.max(1, Number(stroke?.width) || 2)),
          points: Array.isArray(stroke?.points)
            ? stroke.points
                .slice(0, 400)
                .filter((point): point is MarkPoint => typeof point?.x === "number" && typeof point?.y === "number")
                .map((point) => ({ x: clamp01(point.x), y: clamp01(point.y) }))
            : [],
        }))
        .filter((stroke) => stroke.points.length > 1)
    : [];
  const notes = Array.isArray(data.notes)
    ? data.notes
        .slice(0, 20)
        .filter((note) => note && typeof note.text === "string" && note.text.trim())
        .map((note, index) => ({
          id: typeof note.id === "string" ? note.id.slice(0, 40) : `n${index}`,
          x: clamp01(Number(note.x) || 0),
          y: clamp01(Number(note.y) || 0),
          text: note.text.trim().slice(0, 280),
        }))
    : [];
  return { crop, strokes, notes };
}
