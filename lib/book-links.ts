/** Only this application's document URLs are eligible. Never infer origin from a path alone. */
export function internalBookLink(value: string, origin: string): { id: string; href: string } | null {
  if (!origin || /[\s\\]/.test(value) || value.startsWith("//")) return null;
  try {
    const url = new URL(value, origin);
    if (url.origin !== new URL(origin).origin || url.username || url.password || !["http:", "https:"].includes(url.protocol)) return null;
    const id = url.pathname.match(/^\/documents\/([A-Za-z0-9_-]{1,100})\/?$/)?.[1];
    // Preserve page and exact anchor, including old links. No file token is created here.
    return id ? { id, href: url.pathname + url.search + url.hash } : null;
  } catch { return null; }
}

export type BookPreview = { id: string; title: string; authors: string; format: string; language: string; year: string | null; description: string | null };
