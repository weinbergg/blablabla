"use client";

import { Minus, Plus } from "lucide-react";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function ZoomControls({
  value,
  min = 0.8,
  max = 1.8,
  step = 0.1,
  label = "Масштаб",
  compact = false,
  onChange,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  compact?: boolean;
  onChange: (value: number) => void;
}) {
  const percent = Math.round(value * 100);
  const resetDisabled = Math.abs(value - 1) < 0.01;

  return (
    <div className={`inline-flex items-center rounded-full border border-ink/10 bg-paper p-0.5 text-xs ${compact ? "gap-0.5" : ""}`}>
      <button
        type="button"
        onClick={() => onChange(clamp(value - step, min, max))}
        className={`grid place-items-center rounded-full text-muted transition-colors hover:text-ink ${
          compact ? "size-7" : "size-8"
        }`}
        aria-label={`${label}: уменьшить`}
        title="Уменьшить"
      >
        <Minus size={14} />
      </button>
      <button
        type="button"
        onClick={() => onChange(1)}
        disabled={resetDisabled}
        className={`${compact ? "min-w-[3.2rem] px-2 py-0.5" : "min-w-[3.6rem] px-2.5 py-1"} rounded-full font-mono text-[11px] transition-colors ${
          resetDisabled ? "text-muted" : "text-ink hover:bg-ink/[0.04]"
        }`}
        aria-label={`${label}: сбросить`}
        title="Сбросить масштаб"
      >
        {percent}%
      </button>
      <button
        type="button"
        onClick={() => onChange(clamp(value + step, min, max))}
        className={`grid place-items-center rounded-full text-muted transition-colors hover:text-ink ${
          compact ? "size-7" : "size-8"
        }`}
        aria-label={`${label}: увеличить`}
        title="Увеличить"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
