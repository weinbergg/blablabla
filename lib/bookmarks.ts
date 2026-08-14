/**
 * Named bookmarks the reader sets deliberately (separate from auto-saved
 * reading progress). Stored in localStorage so they work without being on
 * the shelf; keyed per document.
 */

export type ReaderBookmark = {
  id: string;
  page: number;
  label: string;
  createdAt: number;
};

const PREFIX = "reader:bookmarks:";

function key(documentId: string) {
  return `${PREFIX}${documentId}`;
}

export function loadBookmarks(documentId: string): ReaderBookmark[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key(documentId));
    if (!raw) return [];
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data
      .filter(
        (item): item is ReaderBookmark =>
          !!item &&
          typeof item === "object" &&
          typeof (item as ReaderBookmark).id === "string" &&
          typeof (item as ReaderBookmark).page === "number" &&
          (item as ReaderBookmark).page >= 1,
      )
      .map((item) => ({
        id: item.id,
        page: Math.floor(item.page),
        label: typeof item.label === "string" ? item.label.slice(0, 80) : `стр. ${item.page}`,
        createdAt: typeof item.createdAt === "number" ? item.createdAt : Date.now(),
      }))
      .sort((a, b) => a.page - b.page || a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

function saveAll(documentId: string, items: ReaderBookmark[]) {
  try {
    window.localStorage.setItem(key(documentId), JSON.stringify(items));
  } catch {
    /* quota */
  }
}

export function addBookmark(
  documentId: string,
  page: number,
  label?: string,
): ReaderBookmark[] {
  const items = loadBookmarks(documentId);
  if (items.some((b) => b.page === page)) return items;
  const next: ReaderBookmark = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    page: Math.floor(page),
    label: (label || `Закладка · стр. ${page}`).slice(0, 80),
    createdAt: Date.now(),
  };
  const updated = [...items, next].sort((a, b) => a.page - b.page || a.createdAt - b.createdAt);
  saveAll(documentId, updated);
  return updated;
}

export function removeBookmark(documentId: string, id: string): ReaderBookmark[] {
  const updated = loadBookmarks(documentId).filter((b) => b.id !== id);
  saveAll(documentId, updated);
  return updated;
}
