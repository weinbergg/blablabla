/**
 * In-browser plain-text reader for TXT uploads (Greek Iliad, Vulgate, etc.).
 * Selection dictionary works the same as PDF/EPUB.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Maximize2, Minimize2 } from "lucide-react";
import { SelectionLookup } from "./selection-lookup";

export function TxtReader({
  url,
  language,
  fullscreen = false,
  onFullscreenChange,
}: {
  url: string;
  language?: string | null;
  fullscreen?: boolean;
  onFullscreenChange?: (value: boolean) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setText(null);
    setError(false);
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        const buf = await res.arrayBuffer();
        // Prefer UTF-8; fall back to latin1 for older Classical dumps.
        let decoded = new TextDecoder("utf-8", { fatal: false }).decode(buf);
        if (decoded.includes("\uFFFD") && buf.byteLength < 8_000_000) {
          decoded = new TextDecoder("latin1").decode(buf);
        }
        // Strip a UTF-8 BOM if present.
        if (decoded.charCodeAt(0) === 0xfeff) decoded = decoded.slice(1);
        if (!cancelled) setText(decoded);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  function syncScrollEdges() {
    const el = wrapRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 2);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 2);
  }

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || text == null) return;
    syncScrollEdges();
    el.addEventListener("scroll", syncScrollEdges, { passive: true });
    const ro = new ResizeObserver(syncScrollEdges);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", syncScrollEdges);
      ro.disconnect();
    };
  }, [text]);

  function scrollByPage(dir: -1 | 1) {
    const el = wrapRef.current;
    if (!el) return;
    const step = Math.max(120, Math.floor(el.clientHeight * 0.85));
    el.scrollBy({ top: dir * step, behavior: "smooth" });
  }

  if (error) {
    return (
      <p className="rounded-2xl border border-ink/10 bg-ink/[0.02] p-8 text-center text-sm text-muted">
        Не получилось открыть текстовый файл — воспользуйтесь скачиванием.
      </p>
    );
  }

  return (
    <div
      className={
        fullscreen
          ? "rounded-2xl border border-ink/10 bg-ink/[0.02] p-2 md:p-3"
          : "rounded-2xl border border-ink/10 bg-ink/[0.02] p-4 md:p-6"
      }
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => scrollByPage(-1)}
            disabled={!canScrollUp}
            className="icon-button"
            aria-label="Прокрутить вверх"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
            Текст · выделите слово для словаря
          </span>
          <button
            type="button"
            onClick={() => scrollByPage(1)}
            disabled={!canScrollDown}
            className="icon-button"
            aria-label="Прокрутить вниз"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        {onFullscreenChange && (
          <button
            type="button"
            onClick={() => onFullscreenChange(!fullscreen)}
            className="icon-button"
            aria-label={fullscreen ? "Свернуть" : "На весь экран"}
          >
            {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        )}
      </div>
      <div className="relative">
        <div
          ref={wrapRef}
          className="relative overflow-y-auto rounded-xl bg-paper px-5 py-6 md:px-10 md:py-8"
          style={{ maxHeight: fullscreen ? "calc(100vh - 8rem)" : "70vh" }}
        >
          {text == null ? (
            <div className="grid place-items-center py-20">
              <Loader2 className="animate-spin text-muted" />
            </div>
          ) : (
            <pre className="whitespace-pre-wrap break-words font-serif text-[15px] leading-7 text-ink md:text-base md:leading-8">
              {text}
            </pre>
          )}
          <SelectionLookup containerRef={wrapRef} language={language} />
        </div>
        <button
          type="button"
          onClick={() => scrollByPage(-1)}
          disabled={!canScrollUp}
          aria-label="Прокрутить вверх"
          className="group absolute inset-y-0 left-0 z-20 hidden w-14 items-center justify-start disabled:cursor-default md:flex"
        >
          <span className="ml-1 grid size-11 place-items-center rounded-full border border-ink/10 bg-paper/90 text-muted opacity-0 shadow-sm transition-all group-hover:opacity-100 group-disabled:!opacity-0 group-hover:border-ink/20 group-hover:text-ink">
            <ChevronLeft size={20} />
          </span>
        </button>
        <button
          type="button"
          onClick={() => scrollByPage(1)}
          disabled={!canScrollDown}
          aria-label="Прокрутить вниз"
          className="group absolute inset-y-0 right-0 z-20 hidden w-14 items-center justify-end disabled:cursor-default md:flex"
        >
          <span className="mr-1 grid size-11 place-items-center rounded-full border border-ink/10 bg-paper/90 text-muted opacity-0 shadow-sm transition-all group-hover:opacity-100 group-disabled:!opacity-0 group-hover:border-ink/20 group-hover:text-ink">
            <ChevronRight size={20} />
          </span>
        </button>
      </div>
    </div>
  );
}
