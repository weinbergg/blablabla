"use client";

import { useState } from "react";
import { REACTIONS, type ReactionCount, type ReactionKey } from "@/lib/reactions";

export function ReactionBar({
  counts,
  onToggle,
  canReact,
}: {
  counts: ReactionCount[];
  onToggle?: (key: ReactionKey) => void;
  canReact: boolean;
}) {
  const [open, setOpen] = useState(false);
  const byKey = new Map(counts.map((item) => [item.key, item]));
  const used = REACTIONS.filter((item) => (byKey.get(item.key)?.count ?? 0) > 0);
  const unused = REACTIONS.filter((item) => (byKey.get(item.key)?.count ?? 0) === 0);
  const shown = open ? REACTIONS : used;

  function chip(item: (typeof REACTIONS)[number]) {
    const state = byKey.get(item.key);
    const on = Boolean(state?.mine);
    const count = state?.count ?? 0;
    return (
      <button
        key={item.key}
        type="button"
        disabled={!canReact}
        title={item.label}
        aria-pressed={on}
        onClick={() => onToggle?.(item.key)}
        className={`reaction-chip ${on ? "reaction-chip-on" : ""}`}
      >
        <span className="font-serif text-[15px] leading-none">{item.glyph}</span>
        {count > 0 ? <span className="text-[11px] tabular-nums">{count}</span> : null}
      </button>
    );
  }

  if (!canReact && used.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {shown.map(chip)}
      {canReact && !open ? (
        <button
          type="button"
          className="reaction-chip"
          title="Поставить реакцию"
          aria-label="Поставить реакцию"
          onClick={() => setOpen(true)}
        >
          <span className="text-[12px]">{used.length ? "…" : "реакция"}</span>
        </button>
      ) : null}
      {canReact && open && unused.length > 0 ? (
        <button type="button" className="reaction-chip" onClick={() => setOpen(false)}>
          <span className="text-[12px]">свернуть</span>
        </button>
      ) : null}
    </div>
  );
}
