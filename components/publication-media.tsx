"use client";

import { useRef, useState } from "react";
import { Download, FileText, Loader2, RotateCcw } from "lucide-react";

export function fileSize(size?: number) {
  if (size == null || !Number.isFinite(size) || size < 0) return "";
  return size < 1024 * 1024 ? `${Math.max(1, Math.ceil(size / 1024))} КБ` : `${(size / 1024 / 1024).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} МБ`;
}

export function PublicationFile({ fileId, label, size, mime }: { fileId: string; label: string; size?: number; mime?: string }) {
  const extension = label.match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toUpperCase();
  return <a href={`/api/community/files/${encodeURIComponent(fileId)}?download=1`} download className="flex min-w-0 items-center gap-4 border-y border-ink/15 py-4 hover:text-rust">
    <FileText size={25} strokeWidth={1.3} className="shrink-0 text-muted" />
    <span className="min-w-0 flex-1"><span className="block break-words text-sm font-medium">{label}</span><span className="mt-1 block text-xs text-muted">{[extension || mime, fileSize(size)].filter(Boolean).join(" · ")}</span></span>
    <span className="flex shrink-0 items-center gap-2 text-xs"><span className="hidden sm:inline">Скачать</span><Download size={17} /></span>
  </a>;
}

export function PublicationVideo({ fileId, caption = "" }: { fileId: string; caption?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  return <div className="relative bg-ink/5">
    <video ref={video} controls playsInline preload="metadata" aria-label={caption || "Видео"} src={`/api/community/files/${encodeURIComponent(fileId)}`} className="aspect-video max-h-[32rem] w-full object-contain" onLoadedMetadata={() => setState("ready")} onCanPlay={() => setState("ready")} onError={() => setState("error")} />
    {state === "loading" && <p role="status" className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center justify-center gap-2 text-sm text-muted"><Loader2 size={16} className="motion-safe:animate-spin" />Загружаем видео…</p>}
    {state === "error" && <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-paper/95 p-4 text-center text-sm"><p>Не удалось открыть видео.</p><p className="max-w-xs text-xs leading-5 text-muted">Проверьте соединение. Если браузер не поддерживает формат, скачайте файл.</p><div className="flex flex-wrap justify-center gap-3"><button type="button" className="button-secondary" onClick={() => { setState("loading"); video.current?.load(); }}><RotateCcw size={14} />Повторить</button><a className="button-secondary" href={`/api/community/files/${fileId}?download=1`} download><Download size={14} />Скачать</a></div></div>}
  </div>;
}
