"use client";

import { useEffect, useRef } from "react";
import { Loader2, Search, X } from "lucide-react";

export type ReaderSearchResult = {
  id: string;
  label: string;
  hint?: string;
  excerpt?: string;
  active?: boolean;
};

export function ReaderSearchPanel({
  open,
  query,
  loading = false,
  results,
  placeholder,
  empty,
  countLabel,
  onQueryChange,
  onSubmit,
  onSelect,
  onClose,
}: {
  open: boolean;
  query: string;
  loading?: boolean;
  results: ReaderSearchResult[];
  placeholder?: string;
  empty?: string;
  countLabel?: string | null;
  onQueryChange: (value: string) => void;
  onSubmit: () => void;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  if (!open) return null;

  const trimmed = query.trim();
  const showEmpty = !loading && trimmed.length >= 2 && results.length === 0;

  return (
    <div className="mb-3 rounded-2xl border border-ink/10 bg-paper p-3 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onSubmit();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              }
            }}
            placeholder={placeholder ?? "Поиск по книге…"}
            className="w-full rounded-full border border-ink/12 bg-transparent py-2 pl-9 pr-3 text-sm text-ink outline-none transition-colors focus:border-rust/45"
          />
        </label>
        <button
          type="button"
          onClick={onSubmit}
          disabled={loading || trimmed.length < 2}
          className="button-secondary !min-h-9 !px-3 !text-xs disabled:cursor-default disabled:opacity-50"
        >
          Найти
        </button>
        <button type="button" onClick={onClose} className="icon-button !size-9" aria-label="Скрыть поиск">
          <X size={14} />
        </button>
      </div>

      {(countLabel || loading) && (
        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted">
          <span>{countLabel}</span>
          {loading && (
            <span className="inline-flex items-center gap-1">
              <Loader2 size={12} className="animate-spin" />
              поиск…
            </span>
          )}
        </div>
      )}

      {showEmpty && (
        <p className="mt-2 rounded-xl border border-ink/8 bg-ink/[0.03] px-3 py-2 text-sm text-muted">
          {empty ?? "Ничего не найдено."}
        </p>
      )}

      {results.length > 0 && (
        <ul className="mt-2 max-h-[min(18rem,42vh)] space-y-1 overflow-y-auto pr-1">
          {results.map((result) => (
            <li key={result.id}>
              <button
                type="button"
                onClick={() => onSelect(result.id)}
                className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                  result.active
                    ? "border-rust/35 bg-rust/[0.08]"
                    : "border-ink/8 bg-transparent hover:border-ink/15 hover:bg-ink/[0.03]"
                }`}
              >
                <span className="block text-sm text-ink">{result.label}</span>
                {result.hint && (
                  <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-widest text-muted">
                    {result.hint}
                  </span>
                )}
                {result.excerpt && (
                  <span className="mt-1 block text-[13px] leading-5 text-muted">
                    {result.excerpt}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
