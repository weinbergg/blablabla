"use client";

import { RefObject, useEffect, useState } from "react";
import { BookOpenText, Languages, MessagesSquare, ScrollText } from "lucide-react";
import type { LookupResult } from "@/lib/lookup";

/**
 * Floating toolbar above a text selection: morphologically-aware dictionary
 * (lemma before Wiktionary), translator, context examples, and Logeion/Perseus
 * for Classical texts. Separate from the annotation flow.
 */
export function SelectionLookup({
  containerRef,
  suppressed = false,
  doc,
  language,
}: {
  containerRef: RefObject<HTMLElement | null>;
  suppressed?: boolean;
  doc?: Document | null;
  /** Document language code (la/grc/ru/…) — biases lemmatisation. */
  language?: string | null;
}) {
  const [state, setState] = useState<{ text: string; top: number; left: number } | null>(null);
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const targetDoc = doc ?? document;
    if (suppressed) {
      setState(null);
      setLookup(null);
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

  useEffect(() => {
    if (!state?.text) {
      setLookup(null);
      return;
    }
    // Only lemmatise single tokens / short phrases — long selections go straight to translate.
    const wordish = state.text.trim().split(/\s+/).length <= 3;
    if (!wordish) {
      setLookup(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: state.text });
        if (language) params.set("lang", language);
        const res = await fetch(`/api/lookup?${params}`);
        if (!res.ok) throw new Error("lookup failed");
        const data = (await res.json()) as LookupResult;
        if (!cancelled) setLookup(data);
      } catch {
        if (!cancelled) setLookup(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [state?.text, language]);

  if (!state) return null;

  const isCyrillic = /[\u0400-\u04FF]/.test(state.text);
  const fallbackTarget = isCyrillic ? "en" : "ru";
  const query = encodeURIComponent(state.text);
  const wikiTitle = encodeURIComponent(lookup?.wiktionaryTitle ?? state.text);
  const wikiHost = lookup?.wiktionaryHost ?? (isCyrillic ? "ru.wiktionary.org" : "en.wiktionary.org");
  const translateTl = lookup?.translateTarget ?? fallbackTarget;
  const reversoPair = lookup?.reversoPair ?? (isCyrillic ? "russian-english" : "english-russian");
  const translateText = encodeURIComponent(state.text);
  const parseLine = lookup?.parses[0]?.summary;
  const lemma = lookup?.lemma;

  return (
    <div
      className="absolute z-30 flex w-max max-w-[min(22rem,90vw)] -translate-x-1/2 -translate-y-full flex-col gap-1.5 rounded-2xl border border-ink/10 bg-paper px-2 py-2 shadow-lg"
      style={{ top: Math.max(0, state.top - 8), left: state.left }}
      onMouseDown={(event) => event.preventDefault()}
    >
      {(loading || lemma || parseLine) && (
        <div className="px-1.5 pt-0.5 text-[11px] leading-snug text-muted">
          {loading && !lemma ? (
            <span>разбор…</span>
          ) : (
            <>
              {lemma && lemma !== state.text.trim() && (
                <span className="font-medium text-ink">
                  → {lemma}
                  {parseLine ? " · " : ""}
                </span>
              )}
              {parseLine && <span>{parseLine}</span>}
              {!lemma && !parseLine && lookup && <span>словарь: {lookup.wiktionaryTitle}</span>}
            </>
          )}
        </div>
      )}
      <div className="flex items-center gap-1">
        <a
          href={`https://${wikiHost}/wiki/${wikiTitle}`}
          target="_blank"
          rel="noopener noreferrer"
          className="icon-button size-8"
          title={
            lemma
              ? `Словарь: открыть лемму «${lemma}» (Wiktionary)`
              : "Открыть в словаре (Wiktionary)"
          }
          aria-label="Словарь"
        >
          <BookOpenText size={13} />
        </a>
        <a
          href={`https://translate.google.com/?sl=auto&tl=${translateTl}&text=${translateText}&op=translate`}
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
        {lookup?.logeionUrl && (
          <a
            href={lookup.logeionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="icon-button size-8"
            title="Logeion — словари греческого и латыни"
            aria-label="Logeion"
          >
            <ScrollText size={13} />
          </a>
        )}
      </div>
    </div>
  );
}
