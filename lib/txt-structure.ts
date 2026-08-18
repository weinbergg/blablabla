/** Split long TXT into stable "листы" and pick out chapter/song headings. */

export const CHARS_PER_PAGE = 3200;

const HEADING =
  /^(?:book|chapter|canto|part|section|песнь|песня|книга|глава|часть|рапсодия|ῥαψωδ[ίι]α|ραψωδια)\s*[.\-—:]?\s*[\divxlcdmα-ωа-я0-9]+\b/i;

const BARE_NUMERAL = /^(?:[ivxlcdm]{1,8}|\d{1,2}|[α-ω]{1,3})$/i;

export function splitTxtPages(source: string): string[] {
  const normalized = source.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [""];

  const paragraphs = normalized.split(/\n{2,}/);
  const pages: string[] = [];
  let buf = "";

  function flush() {
    const trimmed = buf.trim();
    if (trimmed) pages.push(trimmed);
    buf = "";
  }

  for (const para of paragraphs) {
    const block = para.trim();
    if (!block) continue;
    const candidate = buf ? `${buf}\n\n${block}` : block;
    if (candidate.length > CHARS_PER_PAGE && buf) {
      flush();
      if (block.length > CHARS_PER_PAGE * 1.4) {
        for (let i = 0; i < block.length; i += CHARS_PER_PAGE) {
          pages.push(block.slice(i, i + CHARS_PER_PAGE).trim());
        }
      } else {
        buf = block;
      }
    } else {
      buf = candidate;
    }
  }
  flush();
  return pages.length ? pages : [normalized];
}

function looksLikeHeading(line: string) {
  const text = line.replace(/\s+/g, " ").trim();
  if (text.length < 2 || text.length > 80) return false;
  if (HEADING.test(text)) return true;
  if (BARE_NUMERAL.test(text) && text.length <= 6) return true;
  return false;
}

export function txtTableOfContents(pages: string[]): { title: string; page: number }[] {
  const items: { title: string; page: number }[] = [];
  const seen = new Set<string>();
  pages.forEach((pageText, index) => {
    const lines = pageText.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 8);
    for (const line of lines) {
      if (!looksLikeHeading(line)) continue;
      const key = line.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ title: line, page: index + 1 });
      break;
    }
  });
  return items.length >= 2 ? items : [];
}
