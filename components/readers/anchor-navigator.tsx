"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import { X } from "lucide-react";
import { anchorFromHash, exactAnchorMatches, highlightAnchor, rangeForText } from "@/lib/text-anchor";
import { validateAnchor, type TextAnchor } from "@/lib/publication-content";
import { anchorSource } from "./quote-publish";

export function AnchorNavigator({ documentId, fileUrl, containerRef, ready, page, pageCount, onNavigate, docs, resolveCfi }: {
  documentId?: string; fileUrl: string; containerRef: RefObject<HTMLElement | null>; ready: boolean; page: number;
  pageCount?: number; onNavigate: (page: number) => void; docs?: Document[]; resolveCfi?: (anchor: TextAnchor) => Promise<boolean>;
}) {
  const [anchor, setAnchor] = useState<TextAnchor | null>(null); const [status, setStatus] = useState("");
  const resolveRef = useRef(resolveCfi); resolveRef.current = resolveCfi;
  const navigateRef = useRef(onNavigate); navigateRef.current = onNavigate;
  const done = useRef<TextAnchor | null>(null);
  const effectivePage = anchor?.cfi ? 0 : page;
  const renderedDocs = anchor?.cfi ? undefined : docs;
  useEffect(() => {
    if (!documentId) return;
    const hash = () => { const value = anchorFromHash(location.hash, documentId); if (value) { done.current = null; setAnchor(value); } };
    const external = (event: Event) => { try { const value = validateAnchor((event as CustomEvent).detail); if (value.documentId === documentId) { done.current = null; setAnchor(value); } } catch { /* Invalid foreign links never move the reader. */ } };
    hash(); window.addEventListener("hashchange", hash); window.addEventListener("blabla:open-anchor", external);
    return () => { window.removeEventListener("hashchange", hash); window.removeEventListener("blabla:open-anchor", external); };
  }, [documentId]);
  useEffect(() => {
    if (!anchor || !ready || done.current === anchor || !containerRef.current) return;
    let cancelled = false;
    const requested = anchor;
    async function locate() {
      setStatus("Ищем точный фрагмент…");
      try {
        const source = await anchorSource(requested.documentId, fileUrl);
        if (cancelled) return;
        if (requested.cfi && resolveRef.current) {
          if (!await resolveRef.current(requested)) throw new Error("Точное место цитаты не найдено. Текст или структура издания могли измениться.");
        } else {
          const root = containerRef.current!;
          // TXT renders all its sheets. PDF/EPUB render only the current page/section.
          const allPages = root.querySelectorAll("[data-txt-page]").length > 0;
          if (pageCount && requested.page > pageCount) throw new Error("Указанной страницы больше нет в этом издании. Точное место цитаты не найдено.");
          const targetSheet = root.querySelector(`[data-anchor-page="${requested.page}"]`);
          if (!allPages && !targetSheet && effectivePage !== requested.page) { navigateRef.current(requested.page); return; }
          const scope = targetSheet ?? root;
          const roots = renderedDocs?.length ? renderedDocs.map(doc => doc.body) : Array.from(scope.querySelectorAll<HTMLElement>("[data-reader-text]"));
          const found = roots.flatMap(el => exactAnchorMatches(el.textContent ?? "", requested).map(match => ({ el, ...match })));
          if (found.length !== 1) throw new Error(found.length > 1 ? "В тексте несколько одинаковых фрагментов. Точное место не определено — переход отменён." : "Точное место цитаты не найдено. Текст или структура издания могли измениться.");
          const hit = found[0]; const range = rangeForText(hit.el, hit.start, hit.end); if (!range) throw new Error("Не удалось выделить этот фрагмент.");
          highlightAnchor(range);
        }
        if (!cancelled) { done.current = requested; setStatus(requested.textVersion && requested.textVersion !== source.textVersion ? "Точное совпадение найдено. Версия файла изменилась после публикации цитаты." : "Цитата найдена в тексте."); }
      } catch (e) { if (!cancelled) { done.current = requested; setStatus(e instanceof Error ? e.message : "Не удалось открыть фрагмент. Обновите страницу и попробуйте снова."); } }
    }
    // Give PDF's text layer and EPUB's layout time to finish their current render.
    const timer = setTimeout(() => void locate(), 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [anchor, ready, effectivePage, pageCount, containerRef, fileUrl, renderedDocs]);
  if (!anchor || !status) return null;
  return <div role="status" className="mb-3 flex items-start gap-3 border-l-2 border-rust bg-rust/5 px-4 py-3 text-sm leading-6" data-anchor-status><div className="min-w-0 flex-1"><p>{status}</p>{!status.startsWith("Цитата найдена") && <p className="mt-1 line-clamp-3 font-serif text-base text-muted">«{anchor.exact}»</p>}</div><button type="button" className="p-1 text-muted" aria-label="Скрыть сообщение о цитате" onClick={() => setAnchor(null)}><X size={16} /></button></div>;
}
