"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";

export function PdfReader({
  url,
  page,
  onPageChange,
}: {
  url: string;
  page: number;
  onPageChange: (page: number, total: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const loadingTask = pdfjsLib.getDocument(url);
        const doc = await loadingTask.promise;
        if (cancelled) return;
        docRef.current = doc;
        setNumPages(doc.numPages);
        onPageChange(1, doc.numPages);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  useEffect(() => {
    if (!docRef.current || !numPages) return;
    let cancelled = false;

    (async () => {
      const safePage = Math.min(Math.max(page, 1), numPages);
      const pdfPage = await docRef.current!.getPage(safePage);
      if (cancelled) return;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const viewport = pdfPage.getViewport({ scale: 1.5 });
      const context = canvas.getContext("2d");
      if (!context) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await pdfPage.render({ canvasContext: context, viewport }).promise;
    })();

    return () => {
      cancelled = true;
    };
  }, [page, numPages]);

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
          onClick={() => onPageChange(Math.max(1, page - 1), numPages)}
          disabled={page <= 1}
          className="icon-button"
          aria-label="Предыдущая страница"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="font-mono text-xs text-muted">
          {loading ? "Загрузка…" : `стр. ${page} из ${numPages}`}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(numPages, page + 1), numPages)}
          disabled={page >= numPages}
          className="icon-button"
          aria-label="Следующая страница"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="flex min-h-[400px] items-center justify-center overflow-auto">
        {loading ? (
          <Loader2 className="animate-spin text-muted" />
        ) : (
          <canvas ref={canvasRef} className="max-w-full rounded-lg shadow-sm" />
        )}
      </div>
    </div>
  );
}
