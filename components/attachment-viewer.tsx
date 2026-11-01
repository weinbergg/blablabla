"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Crop, Download, Highlighter, StickyNote, X } from "lucide-react";
import { EMPTY_MARKS, parseMarks, type AttachmentMarks, type MarkPoint } from "@/lib/attachment-marks";

export type ViewerFile = {
  id: string;
  kind: string;
  mime: string;
  name: string;
};

type Tool = "none" | "crop" | "pen" | "note";

function srcOf(id: string) {
  return `/api/community/files/${id}`;
}

export function AttachmentViewer({
  item,
  onClose,
  canEdit: allowEditing,
}: {
  item: ViewerFile;
  onClose: () => void;
  canEdit: boolean;
}) {
  const src = srcOf(item.id);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [marks, setMarks] = useState<AttachmentMarks>(EMPTY_MARKS);
  const [tool, setTool] = useState<Tool>("none");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [serverCanEdit, setServerCanEdit] = useState(false);
  const canEdit = allowEditing && serverCanEdit;
  const drawing = useRef(false);
  const stroke = useRef<MarkPoint[]>([]);
  const cropStart = useRef<MarkPoint | null>(null);

  const loadMarks = useCallback(async () => {
    setServerCanEdit(false);
    try {
      const res = await fetch(`/api/community/files/${item.id}/marks`);
      if (!res.ok) throw new Error("Не удалось загрузить пометки.");
      const data = (await res.json()) as { marks?: unknown; canEdit?: boolean };
      setMarks(parseMarks(data.marks));
      setServerCanEdit(data.canEdit === true);
    } catch {
      setMessage("Не удалось загрузить пометки. Откройте вложение повторно.");
    }
  }, [item.id]);

  useEffect(() => {
    void loadMarks();
  }, [loadMarks]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function relativePoint(event: { clientX: number; clientY: number }): MarkPoint | null {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return null;
    return {
      x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)),
    };
  }

  function paint() {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    const box = wrapRef.current;
    if (!canvas || !image || !box) return;
    const width = Math.round(box.clientWidth);
    const height = Math.round(box.clientHeight);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const line of marks.strokes) {
      if (line.points.length < 2) continue;
      ctx.strokeStyle = line.color;
      ctx.lineWidth = line.width;
      ctx.beginPath();
      ctx.moveTo(line.points[0].x * width, line.points[0].y * height);
      for (const point of line.points.slice(1)) {
        ctx.lineTo(point.x * width, point.y * height);
      }
      ctx.stroke();
    }
  }

  useEffect(() => {
    paint();
  }, [marks, item.id]);

  async function saveMarks(next: AttachmentMarks) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/community/files/${item.id}/marks`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marks: next }),
      });
      if (!res.ok) throw new Error("save failed");
      const data = await res.json() as { marks: unknown };
      setMarks(parseMarks(data.marks));
      setMessage("Сохранено.");
    } catch {
      setMessage("Не удалось сохранить пометки.");
    } finally {
      setBusy(false);
    }
  }

  async function saveCroppedFile() {
    const image = imageRef.current;
    if (!image || !marks.crop) return;
    const naturalW = image.naturalWidth || image.width;
    const naturalH = image.naturalHeight || image.height;
    const sx = marks.crop.x * naturalW;
    const sy = marks.crop.y * naturalH;
    const sw = marks.crop.w * naturalW;
    const sh = marks.crop.h * naturalH;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sw));
    canvas.height = Math.max(1, Math.round(sh));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    for (const line of marks.strokes) {
      ctx.strokeStyle = line.color;
      ctx.lineWidth = line.width;
      ctx.lineCap = "round";
      ctx.beginPath();
      line.points.forEach((point, index) => {
        const x = ((point.x - marks.crop!.x) / marks.crop!.w) * canvas.width;
        const y = ((point.y - marks.crop!.y) / marks.crop!.h) * canvas.height;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return;
    setBusy(true);
    const form = new FormData();
    form.append("file", blob, `kadr-${item.name.replace(/\.[^.]+$/, "")}.png`);
    try {
      const res = await fetch(`/api/community/files/${item.id}/derive`, { method: "POST", body: form });
      if (!res.ok) throw new Error("save failed");
      setMessage("Кадр добавлен к сообщению.");
    } catch {
      setMessage("Не удалось сохранить кадр.");
    } finally {
      setBusy(false);
    }
  }

  function onPointerDown(event: React.PointerEvent) {
    if (tool === "none" || !canEdit) return;
    const point = relativePoint(event);
    if (!point) return;
    event.preventDefault();
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    if (tool === "pen") {
      drawing.current = true;
      stroke.current = [point];
    }
    if (tool === "crop") {
      cropStart.current = point;
    }
    if (tool === "note") {
      const text = window.prompt("Пометка на снимке");
      if (!text?.trim()) return;
      setMarks((current) => ({
        ...current,
        notes: [...current.notes, { id: `${Date.now()}`, x: point.x, y: point.y, text: text.trim().slice(0, 280) }],
      }));
    }
  }

  function onPointerMove(event: React.PointerEvent) {
    const point = relativePoint(event);
    if (!point) return;
    if (tool === "pen" && drawing.current) {
      stroke.current = [...stroke.current, point];
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx && stroke.current.length > 1) {
        const prev = stroke.current[stroke.current.length - 2];
        ctx.strokeStyle = "#c85c35";
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(prev.x * canvas.width, prev.y * canvas.height);
        ctx.lineTo(point.x * canvas.width, point.y * canvas.height);
        ctx.stroke();
      }
    }
    if (tool === "crop" && cropStart.current) {
      const start = cropStart.current;
      const x = Math.min(start.x, point.x);
      const y = Math.min(start.y, point.y);
      setMarks((current) => ({
        ...current,
        crop: { x, y, w: Math.abs(point.x - start.x), h: Math.abs(point.y - start.y) },
      }));
    }
  }

  function onPointerUp() {
    if (tool === "pen" && drawing.current && stroke.current.length > 1) {
      const points = stroke.current;
      setMarks((current) => ({
        ...current,
        strokes: [...current.strokes, { color: "#c85c35", width: 2.5, points }],
      }));
    }
    drawing.current = false;
    stroke.current = [];
    cropStart.current = null;
  }

  const crop = marks.crop;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-ink/70 p-4" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col border border-ink/15 bg-paper"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-ink/10 px-4 py-3">
          <p className="mr-auto truncate font-serif text-lg tracking-tight">{item.name}</p>
          {item.kind === "image" && canEdit ? (
            <>
              <button
                type="button"
                className={`icon-button ${tool === "crop" ? "border-rust text-rust" : ""}`}
                aria-label="Кадр"
                title="Кадр"
                onClick={() => setTool((value) => (value === "crop" ? "none" : "crop"))}
              >
                <Crop size={16} />
              </button>
              <button
                type="button"
                className={`icon-button ${tool === "pen" ? "border-rust text-rust" : ""}`}
                aria-label="Перо"
                title="Перо"
                onClick={() => setTool((value) => (value === "pen" ? "none" : "pen"))}
              >
                <Highlighter size={16} />
              </button>
              <button
                type="button"
                className={`icon-button ${tool === "note" ? "border-rust text-rust" : ""}`}
                aria-label="Заметка"
                title="Заметка"
                onClick={() => setTool((value) => (value === "note" ? "none" : "note"))}
              >
                <StickyNote size={16} />
              </button>
              <button type="button" className="button-secondary !min-h-9 !px-3 text-[13px]" disabled={busy} onClick={() => void saveMarks(marks)}>
                Сохранить пометки
              </button>
              {crop ? (
                <button type="button" className="button-secondary !min-h-9 !px-3 text-[13px]" disabled={busy} onClick={() => void saveCroppedFile()}>
                  Сохранить кадр
                </button>
              ) : null}
            </>
          ) : null}
          <a href={`${src}?download=1`} className="icon-button" aria-label="Скачать" title="Скачать">
            <Download size={16} />
          </a>
          <button type="button" className="icon-button" aria-label="Закрыть" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="relative min-h-0 flex-1 overflow-auto bg-[var(--card)] p-4">
          {item.kind === "image" ? (
            <div
              ref={wrapRef}
              className="relative mx-auto inline-block max-h-[72vh] max-w-full"
              style={
                crop
                  ? {
                      overflow: "hidden",
                    }
                  : undefined
              }
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imageRef}
                src={src}
                alt={item.name}
                className="max-h-[72vh] max-w-full object-contain"
                style={
                  crop
                    ? {
                        clipPath: `inset(${crop.y * 100}% ${(1 - crop.x - crop.w) * 100}% ${(1 - crop.y - crop.h) * 100}% ${crop.x * 100}%)`,
                      }
                    : undefined
                }
                onLoad={() => paint()}
                draggable={false}
              />
              <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
              {crop && tool === "crop" ? (
                <div
                  className="pointer-events-none absolute border border-rust"
                  style={{
                    left: `${crop.x * 100}%`,
                    top: `${crop.y * 100}%`,
                    width: `${crop.w * 100}%`,
                    height: `${crop.h * 100}%`,
                  }}
                />
              ) : null}
              {marks.notes.map((note) => (
                <p
                  key={note.id}
                  className="absolute max-w-[14rem] bg-paper/90 px-2 py-1 text-xs leading-4 text-ink"
                  style={{ left: `${note.x * 100}%`, top: `${note.y * 100}%` }}
                >
                  {note.text}
                </p>
              ))}
            </div>
          ) : item.kind === "video" ? (
            <video src={src} controls autoPlay className="mx-auto max-h-[72vh] w-full" />
          ) : (
            <div className="mx-auto max-w-md py-16 text-center">
              <p className="font-serif text-2xl tracking-tight">{item.name}</p>
              <a href={src} className="mt-6 inline-block text-sm text-rust hover:underline">
                Открыть файл
              </a>
            </div>
          )}
        </div>
        {tool !== "none" ? (
          <p className="border-t border-ink/10 px-4 py-2 text-xs text-muted">
            {tool === "crop" && "Проведите прямоугольник по снимку — кадр обрежет показ."}
            {tool === "pen" && "Рисуйте поверх снимка. Пометки общие для нити."}
            {tool === "note" && "Нажмите на снимок, чтобы оставить короткую подпись."}
          </p>
        ) : null}
        {message ? <p className="px-4 pb-3 text-xs text-muted">{message}</p> : null}
      </div>
    </div>
  );
}
