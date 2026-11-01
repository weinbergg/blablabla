"use client";

import { useCallback, useEffect, useState, type SetStateAction } from "react";

/** Scope drafts by account and thread, including replies to different comments. */
export function useCommentDraft(scope: string | null) {
  const key = scope ? `blabla:comment-draft:${scope}` : null;
  const [state, setState] = useState<{ key: string | null; text: string }>({ key, text: "" });
  useEffect(() => {
    let text = "";
    try { text = key ? localStorage.getItem(key) ?? "" : ""; } catch { /* storage may be unavailable */ }
    setState({ key, text });
  }, [key]);

  const setText = useCallback((value: SetStateAction<string>) => {
    setState((current) => {
      const text = typeof value === "function" ? value(current.key === key ? current.text : "") : value;
      try {
        if (key) {
          if (text) localStorage.setItem(key, text);
          else localStorage.removeItem(key);
        }
      } catch { /* keep the in-memory draft even when storage is full */ }
      return { key, text };
    });
  }, [key]);

  return [state.key === key ? state.text : "", setText] as const;
}
