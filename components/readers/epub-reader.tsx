"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

export function EpubReader({ url, fullscreen = false }: { url: string; fullscreen?: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<import("epubjs").Rendition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // A fixed "70vh" reads fine outside fullscreen, but in fullscreen mode it
  // wastes most of the screen on a tall monitor and can overflow it on a
  // short one (a phone in landscape, or a laptop with a tall toolbar/URL
  // bar) — so in fullscreen the height instead tracks the actual space
  // between the reader and the bottom of the viewport, the same approach
  // used for the PDF reader.
  const [height, setHeight] = useState("70vh");

  useEffect(() => {
    if (!fullscreen) {
      setHeight("70vh");
      return;
    }
    const root = rootRef.current;
    if (!root) return;
    function update() {
      const top = root!.getBoundingClientRect().top;
      setHeight(`${Math.max(240, window.innerHeight - top - 12)}px`);
    }
    const observer = new ResizeObserver(update);
    observer.observe(root);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, [fullscreen]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const ePub = (await import("epubjs")).default;
        if (!containerRef.current) return;
        const book = ePub(url);
        const rendition = book.renderTo(containerRef.current, {
          width: "100%",
          height: "100%",
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
    <div
      ref={rootRef}
      className={
        fullscreen
          ? "rounded-2xl border border-ink/10 bg-ink/[0.02] p-2 md:p-2.5"
          : "rounded-2xl border border-ink/10 bg-ink/[0.02] p-4 md:p-6"
      }
    >
      <div className="flex items-center justify-between pb-3 md:pb-4">
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
      <div className="relative" style={{ height, minHeight: 240 }}>
        {loading && (
          <div className="absolute inset-0 grid place-items-center">
            <Loader2 className="animate-spin text-muted" />
          </div>
        )}
        <div ref={containerRef} className="h-full" />
      </div>
    </div>
  );
}
