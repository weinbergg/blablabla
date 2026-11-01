import { validateAnchor, type TextAnchor } from "./publication-content";

/** Exact location identity only. Similar wording and legacy coordinates are insufficient. */
export function sameQuoteAnchor(value: unknown, anchor: TextAnchor): boolean {
  try {
    const other = validateAnchor(value);
    return (["documentId", "textVersion", "exact", "prefix", "suffix", "page", "offset", "cfi"] as const).every(key => other[key] === anchor[key]);
  } catch { return false; }
}
