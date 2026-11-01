import { isExternalHttp } from "./epub-links";

type SpineLike = {
  length?: number;
  get: (target: string | number) => { href?: string } | null;
};

function normalizeEpubHref(raw: string) {
  const withoutQuery = raw.split("?")[0] ?? raw;
  const hashIndex = withoutQuery.indexOf("#");
  const path = hashIndex >= 0 ? withoutQuery.slice(0, hashIndex) : withoutQuery;
  const file = path.split("/").filter(Boolean).pop() ?? path;
  return { path, file };
}

function normalizedPath(raw: string) {
  const path = raw.split(/[?#]/)[0];
  try {
    // Collapse dot segments without depending on the host page's URL.
    return decodeURI(new URL(path, "https://epub.invalid/").pathname).replace(/^\/+/, "");
  } catch {
    return path.replace(/^\/+/, "");
  }
}

function isAuxiliaryEpubHref(href: string) {
  const { path, file } = normalizeEpubHref(href.trim().toLowerCase());
  const haystack = `${path} ${file}`;
  return (
    /(^|[\/._-])(?:nav|toc|contents)(?:[\/._-]|$)/.test(haystack) ||
    /(^|[\/._-])(?:cover|frontispiece|titlepage|halftitle|imprint|copyright|colophon)(?:[\/._-]|$)/.test(
      haystack,
    ) ||
    /(^|[\/._-])wrap(?:[\/._-]|\d|$)/.test(haystack)
  );
}

/** Only return hrefs epub.js can display without navigating the iframe to a 404. */
export function resolveEpubSpineHref(spine: SpineLike | undefined, href: string): string | null {
  const raw = href.trim();
  if (!raw || !spine || isExternalHttp(raw) || raw.startsWith("/documents/")) return raw.startsWith("#") ? raw : null;
  if (raw.startsWith("#")) return raw;

  const hashIndex = raw.indexOf("#");
  const path = (hashIndex >= 0 ? raw.slice(0, hashIndex) : raw).split("?")[0];
  const hash = hashIndex >= 0 ? raw.slice(hashIndex) : "";

  try {
    const direct = spine.get(raw) || spine.get(path);
    if (direct?.href) return hash ? `${direct.href}${hash}` : direct.href;
  } catch {
    /* continue */
  }

  const targetPath = normalizedPath(path);
  if (!targetPath) return null;
  const sections: { href: string; path: string }[] = [];
  const length = spine.length ?? 0;
  for (let i = 0; i < length; i += 1) {
    const section = spine.get(i);
    if (!section?.href) continue;
    sections.push({ href: section.href, path: normalizedPath(section.href) });
  }
  const exact = sections.find((section) => section.path === targetPath);
  if (exact) return `${exact.href}${hash}`;

  // Some EPUB links include the OPF directory. Match the complete path first;
  // a basename fallback is safe only when it identifies exactly one chapter.
  const suffixMatches = sections.filter((section) =>
    targetPath.endsWith(`/${section.path}`) || section.path.endsWith(`/${targetPath}`),
  );
  if (suffixMatches.length === 1) return `${suffixMatches[0].href}${hash}`;
  if (suffixMatches.length > 1) return null;
  const file = targetPath.split("/").pop();
  const fileMatches = sections.filter((section) => section.path.split("/").pop() === file);
  return fileMatches.length === 1 ? `${fileMatches[0].href}${hash}` : null;
}

export function pickReadableEpubHref(
  spine: SpineLike | undefined,
  preferredHrefs: string[] = [],
  page = 1,
) {
  if (!spine) return null;

  const resolvedPreferred = preferredHrefs
    .map((href) => resolveEpubSpineHref(spine, href))
    .filter((href): href is string => Boolean(href));

  const total = spine.length ?? 0;
  const findAround = (start: number) => {
    for (let index = Math.max(0, start); index < total; index += 1) {
      const href = spine.get(index)?.href ?? null;
      if (href && !isAuxiliaryEpubHref(href)) return href;
    }
    for (let index = Math.min(total - 1, start - 1); index >= 0; index -= 1) {
      const href = spine.get(index)?.href ?? null;
      if (href && !isAuxiliaryEpubHref(href)) return href;
    }
    return null;
  };

  if (page > 1) {
    const currentHref = spine.get(page - 1)?.href ?? null;
    if (currentHref && !isAuxiliaryEpubHref(currentHref)) return currentHref;
    const nearbyHref = findAround(page - 1);
    if (nearbyHref) return nearbyHref;
  }

  for (const href of resolvedPreferred) {
    if (!isAuxiliaryEpubHref(href)) return href;
  }

  const fallbackHref = findAround(0);
  if (fallbackHref) return fallbackHref;
  return resolvedPreferred[0] ?? spine.get(0)?.href ?? null;
}
