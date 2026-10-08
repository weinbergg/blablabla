"use client";

import { useState } from "react";
import { Download, Loader2, Lock } from "lucide-react";

/**
 * «Выгрузить заметки в Markdown».
 *
 * Файл маленький, поэтому забираем его через fetch и сохраняем из памяти:
 * так ошибку (нет права, нет заметок) можно показать текстом рядом с кнопкой,
 * а не уводить человека на страницу с json.
 */
export function NotesExportButton({
  allowed,
  documentId,
}: {
  allowed: boolean;
  documentId?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!allowed) {
    return (
      <a href="/pricing" className="button-secondary" title="Экспорт входит в читательский билет">
        <Lock size={15} />
        Выгрузить в Markdown
      </a>
    );
  }

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const url = documentId
        ? `/api/notes/export?document=${encodeURIComponent(documentId)}`
        : "/api/notes/export";
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Не получилось выгрузить");
        return;
      }
      const blob = await response.blob();
      const name =
        response.headers
          .get("Content-Disposition")
          ?.match(/filename\*=UTF-8''([^;]+)/)?.[1] ?? "notes.md";
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = decodeURIComponent(name);
      link.click();
      URL.revokeObjectURL(href);
    } catch {
      setError("Сеть не ответила, попробуйте ещё раз");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button type="button" onClick={download} disabled={busy} className="button-secondary">
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
        Выгрузить в Markdown
      </button>
      {error && <span className="text-xs text-rust">{error}</span>}
    </div>
  );
}
