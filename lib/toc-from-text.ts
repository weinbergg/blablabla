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
  const limit = Math.min(pages.length, 16);
  let best = -1;
  let bestScore = 0;
  for (let i = 0; i < limit; i += 1) {
    const lines = pages[i].split("\n").map(normalizeLine).filter(Boolean);
    const parsed = parseContentsLines(lines.slice(0, 120));
    let score = parsed.length;
    if (lines.slice(0, 12).some(isContentsHeading)) score += 8;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return bestScore >= 4 ? best : -1;
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

export function buildTextToc(
  pages: string[],
  headingItems: TextTocItem[],
): TextToc {
  const contentsIndex = findContentsPageIndex(pages);
  const fromContents =
    contentsIndex >= 0
      ? parseContentsLines(pages[contentsIndex].split("\n")).slice(0, 80)
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
