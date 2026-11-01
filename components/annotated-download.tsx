"use client";

import { useState } from "react";
import { annotatedDownloadFileName } from "@/lib/annotated-filename";

/**
 * Скачивает PDF с пометками, не уводя со страницы. Большой скан сервер
 * отклоняет сразу, и страница книги остаётся на месте.
 */
export function AnnotatedDownload({ documentId }: { documentId: string }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch(`/api/documents/${documentId}/download-annotated`);
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setNote(data.error || "Не удалось собрать файл");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = annotatedDownloadFileName(response.headers.get("Content-Disposition"));
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setNote("Не удалось собрать файл");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void download()}
        disabled={busy}
        className="button-secondary"
        title="Скачать PDF с отмеченными страницами и списком пометок"
      >
        {busy ? "Собираю…" : "С пометками"}
      </button>
      {note && <span className="max-w-xs text-xs leading-5 text-muted">{note}</span>}
    </span>
  );
}
