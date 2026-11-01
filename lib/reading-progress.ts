/**
 * Client-side reading progress. Primary store is localStorage (zero VPS load).
 * Optional cloud sync for shelf books is throttled separately in the workspace.
 */

export type ReadingProgressKind = "pdf" | "epub" | "txt";

export type ReadingProgress = {
  kind: ReadingProgressKind;
  /** 1-based page (PDF) or spine section (EPUB). */
  page: number;
  total?: number;
  /** 0–1 scroll ratio for TXT. */
  scrollRatio?: number;
  /** Exact EPUB screen, used only when the current file checksum matches. */
  epubCfi?: string;
  textVersion?: string;
  updatedAt: number;
};

const PREFIX = "reader:pos:";

function key(documentId: string) {
  return `${PREFIX}${documentId}`;
}

export function loadReadingProgress(documentId: string): ReadingProgress | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key(documentId));
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<ReadingProgress>;
    if (!data || typeof data.page !== "number" || data.page < 1) return null;
    if (data.kind !== "pdf" && data.kind !== "epub" && data.kind !== "txt") return null;
    return {
      kind: data.kind,
      page: Math.floor(data.page),
      total: typeof data.total === "number" ? data.total : undefined,
      epubCfi: typeof data.epubCfi === "string" && data.epubCfi.startsWith("epubcfi(") && data.epubCfi.length < 4096 ? data.epubCfi : undefined,
      textVersion: typeof data.textVersion === "string" ? data.textVersion : undefined,
      scrollRatio:
        typeof data.scrollRatio === "number"
          ? Math.min(1, Math.max(0, data.scrollRatio))
          : undefined,
      updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function saveReadingProgress(documentId: string, progress: Omit<ReadingProgress, "updatedAt">) {
  if (typeof window === "undefined") return;
  try {
    // Workspace page/visibility saves must retain the rendition's precise
    // position within this chapter. A different chapter drops that position.
    const previous = loadReadingProgress(documentId);
    const retained = progress.kind === "epub" && previous?.kind === "epub" && previous.page === progress.page
      ? { epubCfi: previous.epubCfi, textVersion: previous.textVersion } : {};
    const payload: ReadingProgress = { ...retained, ...progress, updatedAt: Date.now() };
    window.localStorage.setItem(key(documentId), JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

/** Cap how many progress keys we keep so localStorage cannot grow forever. */
export function pruneReadingProgress(keepDocumentId?: string, maxEntries = 80) {
  if (typeof window === "undefined") return;
  try {
    const entries: { k: string; at: number }[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k?.startsWith(PREFIX)) continue;
      if (keepDocumentId && k === key(keepDocumentId)) continue;
      try {
        const data = JSON.parse(window.localStorage.getItem(k) || "{}") as { updatedAt?: number };
        entries.push({ k, at: data.updatedAt ?? 0 });
      } catch {
        entries.push({ k, at: 0 });
      }
    }
    if (entries.length <= maxEntries) return;
    entries.sort((a, b) => a.at - b.at);
    const drop = entries.length - maxEntries;
    for (let i = 0; i < drop; i++) {
      window.localStorage.removeItem(entries[i].k);
    }
  } catch {
    /* ignore */
  }
}
