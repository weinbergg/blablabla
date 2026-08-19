/** Pull a table of contents out of a contents page (or heading lines). */

export type TextTocItem = {
  title: string;
  page?: number;
};

export type TextToc = {
  items: TextTocItem[];
  /** 1-based page/лист index of the contents sheet itself, if found. */
  contentsPage: number | null;
};

export type TextTocOffsetMatch = {
  title: string;
  printedPage: number;
  actualPage: number;
  offset: number;
};

const CONTENTS_HEADING =
  /^(?:table\s+of\s+contents|contents|оглавление|содержание|sommaire|inhaltsverzeichnis|indice|index)\b/i;

const ENTRY =
  /^(?:book|chapter|canto|part|section|песнь|песня|книга|глава|часть|рапсодия|ῥαψωδ[ίι]α|booklet|prologue|epilogue|appendix|preface|introduction)\b/i;

export function isContentsHeading(line: string) {
  return CONTENTS_HEADING.test(normalizeLine(line));
}

function normalizeLine(line: string) {
  return line.replace(/\s+/g, " ").trim();
}

function normalizeMatch(value: string) {
  return value
    .toLowerCase()
    .replace(/[\u00ad.]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeTocMatch(value: string) {
  return normalizeMatch(value);
}

export function parseContentsLines(lines: string[]): TextTocItem[] {
  const items: TextTocItem[] = [];
  const seen = new Set<string>();

  for (const raw of lines) {
    const line = normalizeLine(raw);
    if (!line || line.length > 120 || isContentsHeading(line)) continue;
    if (/^(?:page|стр\.?|лист|contents)$/i.test(line)) continue;

    const dotted = line.match(/^(.*?)(?:[\s.]{2,}|\s{2,})(\d{1,4})$/);
    if (dotted) {
      const title = dotted[1].replace(/[. ]+$/, "").trim();
      const page = Number.parseInt(dotted[2], 10);
      if (title.length >= 2 && !seen.has(normalizeMatch(title))) {
        seen.add(normalizeMatch(title));
        items.push({ title, page: Number.isFinite(page) ? page : undefined });
      }
      continue;
    }

    if (
      ENTRY.test(line) ||
      /^(?:[ivxlcdm]{1,8}|\d{1,2}|[α-ω]{1,3})[.:)]\s+\S/.test(line)
    ) {
      const key = normalizeMatch(line);
      if (!seen.has(key)) {
        seen.add(key);
        items.push({ title: line });
      }
    }
  }

  return items;
}

export function findContentsPageIndex(pages: string[]): number {
  const limit = Math.min(pages.length, 24);
  let best = -1;
  let bestScore = 0;
  for (let i = 0; i < limit; i += 1) {
    const lines = pages[i].split("\n").map(normalizeLine).filter(Boolean);
    const parsed = parseContentsLines(lines.slice(0, 120));
    const hasHeading = lines.slice(0, 16).some(isContentsHeading);
    const dotted = parsed.filter((item) => item.page).length;
    if (!hasHeading && dotted < 8) continue;
    const score = parsed.length + (hasHeading ? 10 : 0) + dotted;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best >= 0 && bestScore >= 8 ? best : -1;
}

function dedupeTocItems(items: TextTocItem[]) {
  const seen = new Set<string>();
  const unique: TextTocItem[] = [];
  for (const item of items) {
    const key = normalizeMatch(item.title);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

function looksLikeContentsContinuation(lines: string[], items: TextTocItem[], firstPage: boolean) {
  const dotted = items.filter((item) => item.page).length;
  const hasHeading = lines.slice(0, 16).some(isContentsHeading);
  if (firstPage) return hasHeading || dotted >= 4 || items.length >= 8;
  return hasHeading || dotted >= 2 || items.length >= 6;
}

function collectContentsItems(pages: string[], startIndex: number, maxPages = 3) {
  const collected: TextTocItem[] = [];
  for (let offset = 0; offset < maxPages && startIndex + offset < pages.length; offset += 1) {
    const lines = pages[startIndex + offset].split("\n").map(normalizeLine).filter(Boolean);
    const parsed = parseContentsLines(lines.slice(0, 140));
    if (!looksLikeContentsContinuation(lines, parsed, offset === 0)) {
      if (offset === 0) return [];
      break;
    }
    collected.push(...parsed);
  }
  return dedupeTocItems(collected).slice(0, 120);
}

export function isGarbageTocTitle(title: string) {
  const text = normalizeLine(title);
  if (text.length < 3 || text.length > 90) return true;
  if (/^(?:by\s|copyright|all rights|printed|london|new york|volume\s+[ivx]+$)/i.test(text)) return true;
  if (/^\d{4}\b/.test(text)) return true;
  return false;
}

export function qualityTocItems<T extends { title: string; page?: number }>(items: T[]): T[] {
  return items.filter((item) => !isGarbageTocTitle(item.title));
}

export function locateTitlePage(pages: string[], title: string, startFrom: number): number | null {
  const needle = normalizeMatch(title).slice(0, 48);
  if (needle.length < 4) return null;
  for (let i = startFrom; i < pages.length; i += 1) {
    const head = normalizeMatch(pages[i].split("\n").slice(0, 8).join(" "));
    if (head.includes(needle)) return i + 1;
  }
  return null;
}

export function inferTextTocPageOffset(matches: TextTocOffsetMatch[]) {
  if (matches.length === 0) return null;
  const offsets = matches
    .map((item) => item.offset)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (offsets.length === 0) return null;
  const median = offsets[Math.floor(offsets.length / 2)];
  const clustered = offsets.filter((value) => Math.abs(value - median) <= 5);
  const source = clustered.length > 0 ? clustered : offsets;
  return Math.round(source.reduce((sum, value) => sum + value, 0) / source.length);
}

export async function resolveTextTocPages<T extends TextTocItem>(
  items: T[],
  totalPages: number,
  locate: (item: T) => Promise<number | null> | number | null,
) {
  const directPages = new Map<string, number>();
  const matches: TextTocOffsetMatch[] = [];

  for (const item of items) {
    if (!item.page || item.page < 1) continue;
    const located = await locate(item);
    if (!located || located < 1 || located > totalPages) continue;
    directPages.set(normalizeMatch(item.title), located);
    matches.push({
      title: item.title,
      printedPage: item.page,
      actualPage: located,
      offset: located - item.page,
    });
  }

  const offset = inferTextTocPageOffset(matches);
  const resolved = items.map((item) => {
    const direct = directPages.get(normalizeMatch(item.title));
    if (direct) return { ...item, page: direct };
    if (!item.page || offset == null) return item;
    const shifted = item.page + offset;
    if (shifted < 1 || shifted > totalPages) return item;
    return { ...item, page: shifted };
  });

  return { items: resolved, offset };
}

export function buildTextToc(
  pages: string[],
  headingItems: TextTocItem[],
): TextToc {
  const contentsIndex = findContentsPageIndex(pages);
  const fromContents =
    contentsIndex >= 0
      ? collectContentsItems(pages, contentsIndex)
      : [];

  const startFrom = contentsIndex >= 0 ? contentsIndex + 1 : 0;
  const resolved = fromContents.map((item) => {
    if (item.page && item.page >= 1 && item.page <= pages.length) return item;
    const located = locateTitlePage(pages, item.title, startFrom);
    return located ? { ...item, page: located } : item;
  });

  const items: TextTocItem[] = [];
  const seen = new Set<string>();
  for (const item of [...resolved, ...headingItems]) {
    const key = normalizeMatch(item.title);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }

  return {
    items,
    contentsPage: contentsIndex >= 0 ? contentsIndex + 1 : null,
  };
}
