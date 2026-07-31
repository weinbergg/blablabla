"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import type { LibraryStatus } from "@/lib/library-types";

export function StarRating({
  value,
  size = 14,
  className = "",
}: {
  value: number;
  size?: number;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          className={n <= Math.round(value) ? "fill-rust text-rust" : "text-ink/15"}
        />
      ))}
    </span>
  );
}

export function RateReviewPanel({
  documentId,
  status,
  initialRating,
  initialReview,
}: {
  documentId: string;
  status: LibraryStatus;
  initialRating: number | null;
  initialReview: string | null;
}) {
  const [rating, setRating] = useState(initialRating ?? 0);
  const [hoverRating, setHoverRating] = useState(0);
  const [review, setReview] = useState(initialReview ?? "");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setSaved(false);
    const response = await fetch(`/api/library/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, rating: rating || null, reviewBody: review || null }),
    });
    setBusy(false);
    if (response.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-muted underline underline-offset-2 hover:text-ink">
        {rating || review ? "Изменить вашу оценку" : "Оценить и написать отзыв"}
      </button>
    );
  }

  return (
    <div className="w-full max-w-xs rounded-xl border border-ink/10 bg-paper p-4 shadow-sm md:w-72">
      <p className="mb-2 text-xs font-medium">Ваша оценка</p>
      <div className="mb-3 flex items-center gap-1" onMouseLeave={() => setHoverRating(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n === rating ? 0 : n)}
            onMouseEnter={() => setHoverRating(n)}
            aria-label={`${n} из 5`}
          >
            <Star size={20} className={n <= (hoverRating || rating) ? "fill-rust text-rust" : "text-ink/15"} />
          </button>
        ))}
      </div>
      <textarea
        value={review}
        onChange={(event) => setReview(event.target.value)}
        placeholder="Пара слов о книге — видно будет всем (необязательно)"
        rows={3}
        className="mb-3 w-full resize-none rounded-lg border border-ink/10 px-3 py-2 text-sm"
      />
      <div className="flex items-center gap-2">
        <button type="button" onClick={save} disabled={busy} className="button-primary flex-1 justify-center py-1.5 text-xs">
          {busy ? "Сохраняю…" : saved ? "Сохранено" : "Сохранить"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted hover:text-ink">
          Скрыть
        </button>
      </div>
    </div>
  );
}
