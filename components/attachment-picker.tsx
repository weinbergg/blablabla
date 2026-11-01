"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Paperclip, X } from "lucide-react";

import { fileSize } from "./publication-media";

export type PickedFile = {
  id: string;
  kind: "image" | "video" | "file";
  name: string;
  mime: string;
  size?: number;
};

export function AttachmentPicker({
  files,
  onChange,
  compact = false,
  onUploadError,
  onBusyChange,
  accept,
}: {
  files: PickedFile[];
  onChange: (next: PickedFile[]) => void;
  compact?: boolean;
  onUploadError?: (message: string) => void;
  onBusyChange?: (busy: boolean) => void;
  accept?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function pick(list: FileList | null) {
    if (!list?.length) return;
    setError("");
    onUploadError?.("");
    setBusy(true); onBusyChange?.(true);
    const next = [...files];
    function failed(message: string) { setError(message); onUploadError?.(message); }
    try {
    for (const file of Array.from(list).slice(0, 8 - next.length)) {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/community/uploads", { method: "POST", body });
      const data = (await response.json().catch(() => ({}))) as PickedFile & { error?: string };
      if (!response.ok) {
        failed(data.error || "Не удалось загрузить файл.");
        break;
      }
      next.push({ id: data.id, kind: data.kind, name: data.name, mime: data.mime, size: data.size });
    }
    } catch { failed("Соединение прервалось. Уже загруженные файлы сохранены; повторите загрузку остальных."); }
    finally { setBusy(false); onBusyChange?.(false); if (next.length > files.length) onChange(next); }
  }

  function remove(id: string) {
    onChange(files.filter((file) => file.id !== id));
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept || "image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,application/pdf,.epub,.txt,.zip"}
        className="sr-only"
        disabled={busy || files.length >= 8}
        onChange={(event) => {
          void pick(event.target.files);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        className="button-secondary h-10 min-h-0 px-3 text-sm"
        disabled={busy || files.length >= 8}
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip size={15} />
        {busy ? "Загружаю…" : compact ? "Файл" : "Прикрепить"}
      </button>
      {files.length > 0 && (
        <ul className="space-y-3">
          {files.map((file, index) => (
            <li
              key={file.id}
              className="flex min-w-0 items-center gap-2 border-b border-ink/10 py-3 text-xs"
            >
              {file.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/community/files/${file.id}`}
                  alt=""
                  className="size-14 shrink-0 object-cover"
                />
              ) : null}
              <span className="min-w-0 flex-1"><span className="block truncate">{file.name}</span><span className="mt-1 block text-muted">{fileSize(file.size)}</span></span>
              <button type="button" className="p-2 disabled:opacity-25" aria-label={`Выше: ${file.name}`} disabled={busy || index === 0} onClick={() => { const next = [...files]; [next[index-1], next[index]] = [next[index], next[index-1]]; onChange(next); }}><ArrowUp size={14} /></button>
              <button type="button" className="p-2 disabled:opacity-25" aria-label={`Ниже: ${file.name}`} disabled={busy || index === files.length - 1} onClick={() => { const next = [...files]; [next[index+1], next[index]] = [next[index], next[index+1]]; onChange(next); }}><ArrowDown size={14} /></button>
              <button
                type="button"
                className="p-2 text-muted hover:text-rust"
                disabled={busy}
                onClick={() => remove(file.id)}
                aria-label={`Убрать ${file.name}`}
              >
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error ? <p role="alert" className="text-sm text-rust">{error}</p> : null}
      {!compact ? (
        <p className="text-[11px] leading-4 text-muted">
          Фото, видео, PDF, EPUB, TXT или ZIP. До 8 файлов.
        </p>
      ) : null}
    </div>
  );
}
