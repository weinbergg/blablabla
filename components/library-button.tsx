"use client";

import { useRef, useState } from "react";
import { BookMarked, Check, ChevronDown } from "lucide-react";
import { LIBRARY_STATUS_LABELS, type LibraryStatus } from "@/lib/library-types";

const STATUS_ORDER: LibraryStatus[] = ["want", "reading", "done"];

export function LibraryButton({
  documentId,
  initialStatus,
}: {
  documentId: string;
  initialStatus: LibraryStatus | null;
}) {
  const [status, setStatus] = useState<LibraryStatus | null>(initialStatus);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function choose(next: LibraryStatus) {
    setBusy(true);
    setOpen(false);
    const response = await fetch(`/api/library/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setBusy(false);
    if (response.ok) setStatus(next);
  }

  async function removeFromShelf() {
    setBusy(true);
    setOpen(false);
    const response = await fetch(`/api/library/${documentId}`, { method: "DELETE" });
    setBusy(false);
    if (response.ok) setStatus(null);
  }

  return (
    <div
      className="relative"
      onMouseLeave={() => {
        closeTimer.current = setTimeout(() => setOpen(false), 200);
      }}
      onMouseEnter={() => {
        if (closeTimer.current) clearTimeout(closeTimer.current);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className={status ? "button-primary" : "button-secondary"}
      >
        <BookMarked size={15} />
        {status ? LIBRARY_STATUS_LABELS[status] : "В библиотеку"}
        <ChevronDown size={13} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-48 overflow-hidden rounded-xl border border-ink/10 bg-paper shadow-xl">
          {STATUS_ORDER.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => choose(option)}
              className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-ink/5"
            >
              {LIBRARY_STATUS_LABELS[option]}
              {status === option && <Check size={14} />}
            </button>
          ))}
          {status && (
            <button
              type="button"
              onClick={removeFromShelf}
              className="block w-full border-t border-ink/10 px-4 py-2.5 text-left text-sm text-muted hover:bg-ink/5 hover:text-ink"
            >
              Убрать с полки
            </button>
          )}
        </div>
      )}
    </div>
  );
}
