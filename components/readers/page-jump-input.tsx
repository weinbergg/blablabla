"use client";

import { FormEvent, useEffect, useState } from "react";

/** Editable page / chapter counter for PDF & EPUB toolbars. */
export function PageJumpInput({
  page,
  total,
  label = "стр.",
  display,
  disabled = false,
  onJump,
}: {
  page: number;
  total: number;
  label?: string;
  /** When set, shown instead of `${label} ${page}` while not editing. */
  display?: string;
  disabled?: boolean;
  onJump: (page: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(page));

  useEffect(() => {
    if (!editing) setDraft(String(page));
  }, [page, editing]);

  function commit(raw: string) {
    const next = Number.parseInt(raw.trim(), 10);
    setEditing(false);
    if (!Number.isFinite(next) || next < 1) {
      setDraft(String(page));
      return;
    }
    onJump(Math.min(total || next, Math.max(1, next)));
  }

  const idleLabel = display ?? `${label} ${page}${total ? ` из ${total}` : ""}`;

  if (disabled || total < 1) {
    return (
      <span className="min-w-[9rem] text-center font-mono text-xs text-muted">{idleLabel}</span>
    );
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(String(page));
          setEditing(true);
        }}
        className="min-w-[9rem] rounded-md px-1.5 py-0.5 text-center font-mono text-xs text-muted transition-colors hover:bg-ink/5 hover:text-ink"
        title="Нажмите, чтобы ввести номер страницы"
        aria-label={`${idleLabel}. Нажмите, чтобы перейти`}
      >
        {idleLabel}
      </button>
    );
  }

  return (
    <form
      className="flex min-w-[9rem] items-center justify-center gap-1"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        commit(draft);
      }}
    >
      <span className="font-mono text-[10px] text-muted">{label}</span>
      <input
        autoFocus
        inputMode="numeric"
        value={draft}
        onChange={(event) => setDraft(event.target.value.replace(/[^\d]/g, "").slice(0, 5))}
        onBlur={() => commit(draft)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setEditing(false);
            setDraft(String(page));
          }
        }}
        className="w-12 rounded border border-ink/20 bg-paper px-1 py-0.5 text-center font-mono text-xs outline-none focus:border-ink/50"
        aria-label="Номер страницы"
      />
      <span className="font-mono text-[10px] text-muted">/ {total}</span>
    </form>
  );
}
