"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

export function EpubReader({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<import("epubjs").Rendition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const ePub = (await import("epubjs")).default;
        if (!containerRef.current) return;
        const book = ePub(url);
        const rendition = book.renderTo(containerRef.current, {
          width: "100%",
          height: "70vh",
        });
        renditionRef.current = rendition;
        await rendition.display();
        if (!cancelled) setLoading(false);
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      renditionRef.current?.destroy();
    };
  }, [url]);

  if (error) {
    return (
      <p className="rounded-2xl border border-ink/10 bg-ink/[0.02] p-8 text-center text-sm text-muted">
        Не получилось открыть файл для чтения в браузере — воспользуйтесь
        скачиванием.
      </p>
    );
  }

  return (
    <div className="rounded-2xl border border-ink/10 bg-ink/[0.02] p-4 md:p-6">
      <div className="flex items-center justify-between pb-4">
        <button
          type="button"
          onClick={() => renditionRef.current?.prev()}
          className="icon-button"
          aria-label="Предыдущая страница"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="font-mono text-xs text-muted">EPUB</span>
        <button
          type="button"
          onClick={() => renditionRef.current?.next()}
          className="icon-button"
          aria-label="Следующая страница"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="relative min-h-[400px]">
        {loading && (
          <div className="absolute inset-0 grid place-items-center">
            <Loader2 className="animate-spin text-muted" />
          </div>
        )}
        <div ref={containerRef} />
      </div>
    </div>
  );
}
