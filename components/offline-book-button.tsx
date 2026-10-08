"use client";

import { useEffect, useState } from "react";
import { Check, HardDrive, Loader2, Trash2 } from "lucide-react";
import { getOfflineBook, removeOfflineBook, saveOfflineBook } from "@/lib/offline-store";

/**
 * «Оставить на этом устройстве»: книга копируется в IndexedDB этого браузера.
 * Читать её можно без сети. Это не замена OPDS — для читалки по-прежнему
 * каталог /opds, а здесь — запасной экземпляр в Chrome/Safari на ноутбуке.
 */
export function OfflineBookButton({
  documentId,
  title,
  fileType,
  sourceUrl,
}: {
  documentId: string;
  title: string;
  fileType: string;
  sourceUrl: string | null;
}) {
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getOfflineBook(documentId).then((row) => {
      if (!cancelled) setSaved(Boolean(row?.blob));
    });
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  async function save() {
    if (!sourceUrl) {
      setError("Нет файла, который можно сохранить");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(sourceUrl);
      if (!response.ok) throw new Error("Не удалось скачать файл");
      const blob = await response.blob();
      await saveOfflineBook({
        id: documentId,
        title,
        fileType,
        savedAt: Date.now(),
        bytes: blob.size,
        blob,
      });
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не хватило места на устройстве");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    await removeOfflineBook(documentId);
    setSaved(false);
    setBusy(false);
  }

  return (
    <div className="flex flex-col items-start gap-1">
      {saved ? (
        <button type="button" onClick={remove} disabled={busy} className="button-secondary">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
          На этом устройстве
          <Trash2 size={13} className="opacity-60" />
        </button>
      ) : (
        <button
          type="button"
          onClick={save}
          disabled={busy || !sourceUrl}
          className="button-secondary"
          title="Копия файла останется в этом браузере и откроется без интернета"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <HardDrive size={15} />}
          Оставить офлайн
        </button>
      )}
      {error && <span className="text-xs text-rust">{error}</span>}
    </div>
  );
}
