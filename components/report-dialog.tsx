"use client";

import { FormEvent, useEffect, useState } from "react";
import { X } from "lucide-react";

const PRESETS = [
  "Оскорбление или травля",
  "Спам или реклама",
  "Не по теме / мусор",
  "Нарушение авторских прав",
  "Другое",
] as const;

export async function submitReportWithReason(
  targetType: "annotation" | "comment",
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
  targetType: "annotation" | "comment" | null;
  targetId: string | null;
  onClose: () => void;
}) {
  const [preset, setPreset] = useState<(typeof PRESETS)[number]>("Оскорбление или травля");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setPreset("Оскорбление или травля");
    setDetails("");
    setError("");
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !targetType || !targetId) return null;

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
    const ok = await submitReportWithReason(targetType, targetId, reason.slice(0, 500));
    setBusy(false);
    if (!ok) {
      setError("Не получилось отправить жалобу.");
      return;
    }
    window.alert("Спасибо, жалоба отправлена модератору.");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/40 p-4 sm:items-center" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Закрыть" onClick={onClose} />
      <form
        onSubmit={submit}
        className="relative z-10 w-full max-w-md rounded-2xl border border-ink/10 bg-paper p-5 shadow-2xl"
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
          <select value={preset} onChange={(event) => setPreset(event.target.value as (typeof PRESETS)[number])}>
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
      </form>
    </div>
  );
}
