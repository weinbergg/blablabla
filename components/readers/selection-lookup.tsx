"use client";

import { RefObject, useEffect, useState } from "react";
import { BookOpenText, Languages, MessagesSquare } from "lucide-react";

/**
 * A small floating toolbar that appears above any text the reader selects
 * inside a book, offering one-click lookups in a dictionary, a translator,
 * and a bilingual phrase/context tool — without leaving the page or
 * committing to placing a sticker. Deliberately separate from the
 * annotation "anchor to this text" flow: this is a quick reference lookup,
 * not something that gets saved.
 */
export function SelectionLookup({
  containerRef,
  suppressed = false,
  doc,
}: {
  containerRef: RefObject<HTMLElement | null>;
  /** Hidden while the reader is actively placing a sticker or drawing, so the two selection-driven affordances don't compete for the same gesture. */
  suppressed?: boolean;
  /**
   * The document whose selection to watch — defaults to the page's own
   * document (works for the PDF reader, whose text layer lives inline).
   * The EPUB reader renders book content inside an iframe with its own
   * separate document/selection, so it passes that iframe's document
   * here instead; positions are then translated from the iframe's
   * viewport into the outer one via `frameElement`.
   */
  doc?: Document | null;
}) {
  const [state, setState] = useState<{ text: string; top: number; left: number } | null>(null);

  useEffect(() => {
    const targetDoc = doc ?? document;
    if (suppressed) {
      setState(null);
      return;
    }

    function handle() {
      const container = containerRef.current;
      const targetWindow = targetDoc.defaultView;
      const selection = targetWindow?.getSelection();
      if (!container || !selection || selection.isCollapsed || selection.rangeCount === 0) {
        setState(null);
        return;
      }
      const range = selection.getRangeAt(0);
      const isIframeDoc = doc && doc !== document;
      if (!isIframeDoc && !container.contains(range.commonAncestorContainer)) {
        setState(null);
        return;
      }
      const text = selection.toString().trim();
      if (!text || text.length > 300) {
        setState(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      if (!rect.width && !rect.height) {
        setState(null);
        return;
      }
      // A selection inside the EPUB iframe reports coordinates relative to
      // that iframe's own viewport — offsetting by the iframe element's own
      // position (in the outer document) brings it back into the same
      // coordinate space the popover itself renders in.
      const frameElement = isIframeDoc ? targetWindow?.frameElement : null;
      const frameOffset = frameElement?.getBoundingClientRect() ?? { top: 0, left: 0 };
      const containerRect = container.getBoundingClientRect();
      setState({
        text,
        top: frameOffset.top + rect.top - containerRect.top,
        left: frameOffset.left + rect.left - containerRect.left + rect.width / 2,
      });
    }

    targetDoc.addEventListener("selectionchange", handle);
    return () => targetDoc.removeEventListener("selectionchange", handle);
  }, [containerRef, suppressed, doc]);

  if (!state) return null;

  const isCyrillic = /[\u0400-\u04FF]/.test(state.text);
  const targetLang = isCyrillic ? "en" : "ru";
  const query = encodeURIComponent(state.text);
  const wiktionaryHost = isCyrillic ? "ru.wiktionary.org" : "en.wiktionary.org";
  const reversoPair = isCyrillic ? "russian-english" : "english-russian";

  return (
    <div
      className="absolute z-30 flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-full border border-ink/10 bg-paper px-1.5 py-1 shadow-lg"
      style={{ top: Math.max(0, state.top - 8), left: state.left }}
      // Selecting text again to click this shouldn't collapse the very
      // selection it's meant to act on.
      onMouseDown={(event) => event.preventDefault()}
    >
      <a
        href={`https://${wiktionaryHost}/wiki/${query}`}
        target="_blank"
        rel="noopener noreferrer"
        className="icon-button size-8"
        title="Открыть в словаре (Wiktionary)"
        aria-label="Словарь"
      >
        <BookOpenText size={13} />
      </a>
      <a
        href={`https://translate.google.com/?sl=auto&tl=${targetLang}&text=${query}&op=translate`}
        target="_blank"
        rel="noopener noreferrer"
        className="icon-button size-8"
        title="Перевести (Google Translate)"
        aria-label="Перевести"
      >
        <Languages size={13} />
      </a>
      <a
        href={`https://context.reverso.net/translation/${reversoPair}/${query}`}
        target="_blank"
        rel="noopener noreferrer"
        className="icon-button size-8"
        title="Примеры перевода в контексте (Reverso)"
        aria-label="Контекст"
      >
        <MessagesSquare size={13} />
      </a>
    </div>
  );
}
