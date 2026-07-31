/**
 * In-browser plain-text reader for TXT uploads (Greek Iliad, Vulgate, etc.).
 * Selection dictionary works the same as PDF/EPUB.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Maximize2, Minimize2 } from "lucide-react";
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
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
          Текст · выделите слово для словаря
        </span>
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
    </div>
  );
}
