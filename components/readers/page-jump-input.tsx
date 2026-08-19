"use client";

import { FormEvent, useEffect, useState } from "react";

/** Always-visible page field — not a hidden native select. */
export function PageJumpInput({
  page,
  total,
  label = "стр.",
  display,
  disabled = false,
  compact = false,
  onJump,
}: {
  page: number;
  total: number;
  label?: string;
  display?: string;
  disabled?: boolean;
  compact?: boolean;
  onJump: (page: number) => void;
}) {
  const [draft, setDraft] = useState(String(page));

  useEffect(() => {
    setDraft(String(page));
  }, [page]);

  function commit(raw: string) {
    const next = Number.parseInt(raw.trim(), 10);
    if (!Number.isFinite(next) || next < 1) {
      setDraft(String(page));
      return;
    }
    onJump(Math.min(total || next, Math.max(1, next)));
  }

  if (disabled || total < 1) {
    return (
      <span className={`rounded-full border border-ink/10 font-mono text-xs text-muted ${compact ? "px-2.5 py-1" : "px-3 py-1.5"}`}>
        {display ?? `${label} —`}
      </span>
    );
  }

  return (
    <form
      className={`flex items-center rounded-full border border-ink/15 bg-paper shadow-[inset_0_0_0_1px_transparent] focus-within:border-rust/50 ${
        compact ? "gap-1 px-2.5 py-1" : "gap-2 px-3 py-1"
      }`}
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        commit(draft);
      }}
    >
      {!compact && (
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted">{label}</span>
      )}
      <input
        inputMode="numeric"
        value={draft}
        onChange={(event) => setDraft(event.target.value.replace(/[^\d]/g, "").slice(0, 5))}
        onBlur={() => commit(draft)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setDraft(String(page));
        }}
        className={`bg-transparent text-center font-serif tabular-nums text-ink outline-none ${
          compact ? "w-10 text-[15px]" : "w-12 text-base"
        }`}
        aria-label={`Номер: ${label}`}
        title="Введите номер и нажмите Enter"
      />
      <span className="font-mono text-[10px] text-muted">{compact ? `/${total}` : `из ${total}`}</span>
    </form>
  );
}
