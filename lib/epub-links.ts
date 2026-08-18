/** Parse EPUB / Gutenberg hyperlinks so the reader can keep them on-site. */

export function gutenbergIdFromHref(href: string): string | null {
  const trimmed = href.trim();
  const patterns = [
    /gutenberg\.org\/(?:ebooks|files|cache\/epub)\/(\d+)/i,
    /(?:^|\/)(?:ebooks|files)\/(\d+)(?:\/|$|\.|#|\?)/i,
  ];
  for (const re of patterns) {
    const match = trimmed.match(re);
    if (match?.[1]) return match[1];
  }
  return null;
}

export function isExternalHttp(href: string): boolean {
  return /^(https?:)?\/\//i.test(href.trim());
}

export function isIgnorableHref(href: string): boolean {
  return /^(mailto:|javascript:|data:|tel:)/i.test(href.trim());
}

export function displayCandidates(href: string): string[] {
  const raw = href.trim();
  if (!raw) return [];
  const withoutQuery = raw.split("?")[0] ?? raw;
  const hashIndex = withoutQuery.indexOf("#");
  const path = hashIndex >= 0 ? withoutQuery.slice(0, hashIndex) : withoutQuery;
  const hash = hashIndex >= 0 ? withoutQuery.slice(hashIndex) : "";
  const file = path.split("/").filter(Boolean).pop() ?? "";
  const unique = new Set<string>();
  for (const candidate of [raw, withoutQuery, path, file && hash ? `${file}${hash}` : "", file, hash]) {
    if (candidate) unique.add(candidate);
  }
  return [...unique];
}
