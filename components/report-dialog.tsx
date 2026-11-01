"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

export type ReportTarget = "annotation" | "comment" | "channel_post" | "forum_post";

const PRESETS = [
  "Оскорбление или травля",
  "Спам или реклама",
  "Не по теме / мусор",
  "Нарушение авторских прав",
  "Другое",
] as const;

export async function submitReportWithReason(
  targetType: ReportTarget,
  targetId: string,
  reason: string,
) {
  const response = await fetch("/api/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetType, targetId, reason }),
  });
  return response.ok;
}

/** Modal report form — reason is required so moderators see why it was flagged. */
export function ReportDialog({
  open,
  targetType,
  targetId,
  onClose,
}: {
  open: boolean;
  targetType: ReportTarget | null;
  targetId: string | null;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [sent, setSent] = useState(false);
  const [preset, setPreset] = useState<(typeof PRESETS)[number]>("Оскорбление или травля");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) { dialog.current?.close(); return; }
    dialog.current?.showModal(); setSent(false);
    setPreset("Оскорбление или травля");
    setDetails("");
    setError("");
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);


  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!targetType || !targetId) return;
    const reason =
      preset === "Другое"
        ? details.trim()
        : details.trim()
          ? `${preset}: ${details.trim()}`
          : preset;
    if (!reason) {
      setError("Укажите причину жалобы.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const ok = await submitReportWithReason(targetType, targetId, reason.slice(0, 500));
      if (!ok) throw new Error("Не получилось отправить жалобу. Попробуйте ещё раз.");
      setSent(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Нет связи. Причина жалобы сохранена в этом окне."); } finally { setBusy(false); }
  }

  return (
    <dialog ref={dialog} className="publication-dialog" aria-label="Жалоба на материал" onCancel={onClose} onClose={onClose}>
      {sent ? <div><h2 className="font-serif text-2xl">Жалоба отправлена</h2><p role="status" className="mt-4 text-sm leading-7 text-muted">Модератор рассмотрит причину и материал. Спасибо, что помогаете беречь пространство разговора.</p><button type="button" className="button-primary mt-6" onClick={onClose}>Закрыть</button></div> :
      <form
        onSubmit={submit}
        className="w-full"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl">Пожаловаться</h2>
            <p className="mt-1 text-xs text-muted">
              Причина обязательна — модератор увидит её вместе с текстом записи.
            </p>
          </div>
          <button type="button" onClick={onClose} className="icon-button !size-8" aria-label="Закрыть">
            <X size={14} />
          </button>
        </div>
        <label className="field mb-3">
          <span>Причина</span>
          <select aria-label="Причина" value={preset} onChange={(event) => setPreset(event.target.value as (typeof PRESETS)[number])}>
            {PRESETS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="field mb-4">
          <span>{preset === "Другое" ? "Опишите проблему *" : "Комментарий (необязательно)"}</span>
          <textarea
            rows={3}
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            required={preset === "Другое"}
            placeholder="Что именно не так?"
          />
        </label>
        {error && <p className="mb-3 text-sm text-rust">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="button-secondary">
            Отмена
          </button>
          <button type="submit" className="button-primary" disabled={busy}>
            {busy ? "Отправляю…" : "Отправить"}
          </button>
        </div>
      </form>}
    </dialog>
  );
}
