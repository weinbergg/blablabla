/** Split long TXT into stable "листы" and pick out chapter/song headings. */

import { buildTextToc, qualityTocItems } from "./toc-from-text";

export const CHARS_PER_PAGE = 3200;
const MAX_ESTIMATED_LINES_PER_PAGE = 32;
const VERSE_CHARS_PER_PAGE = 5200;
const VERSE_LINES_PER_PAGE = 52;
const APPROX_CHARS_PER_LINE = 76;
const MAX_FALLBACK_TOC_ITEMS = 24;

const HEADING =
  /^(?:book|chapter|canto|part|section|песнь|песня|книга|глава|часть|рапсодия|ῥαψωδ[ίι]α|ραψωδια)\s*[.\-—:]?\s*[\divxlcdmα-ωа-я0-9]+\b/i;

const BARE_NUMERAL = /^(?:[ivxlcdm]{1,8}|\d{1,2}|[α-ω]{1,3})$/i;

function estimateVisualLines(text: string) {
  return text
    .split("\n")
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.trimEnd().length / APPROX_CHARS_PER_LINE)), 0);
}

function detectTxtLayout(source: string) {
  const lines = source.split("\n").map((line) => line.trimEnd()).filter((line) => line.trim().length > 0);
  if (lines.length < 80) {
    return {
      charsPerPage: CHARS_PER_PAGE,
      maxLinesPerPage: MAX_ESTIMATED_LINES_PER_PAGE,
    };
  }
  const lengths = lines.map((line) => line.length);
  const averageLength = lengths.reduce((sum, value) => sum + value, 0) / lengths.length;
  const shortRatio = lengths.filter((value) => value < 72).length / lengths.length;
  const mediumRatio = lengths.filter((value) => value < 64).length / lengths.length;
  const verseLike = averageLength < 64 && shortRatio > 0.94 && mediumRatio > 0.68;
  return verseLike
    ? {
        charsPerPage: VERSE_CHARS_PER_PAGE,
        maxLinesPerPage: VERSE_LINES_PER_PAGE,
      }
    : {
        charsPerPage: CHARS_PER_PAGE,
        maxLinesPerPage: MAX_ESTIMATED_LINES_PER_PAGE,
      };
}

function splitLongTxtBlock(block: string, charsPerPage: number, maxLinesPerPage: number) {
  const lines = block.split("\n");
  const chunks: string[] = [];
  let chunk: string[] = [];

  function flush() {
    const text = chunk.join("\n").trim();
    if (text) chunks.push(text);
    chunk = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const candidate = chunk.length ? `${chunk.join("\n")}\n${line}` : line;
    if (
      chunk.length &&
      (candidate.length > charsPerPage || estimateVisualLines(candidate) > maxLinesPerPage)
    ) {
      flush();
    }
    chunk.push(line);
  }

  flush();
  return chunks;
}

export function splitTxtPages(source: string): string[] {
  const normalized = source.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [""];
  const { charsPerPage, maxLinesPerPage } = detectTxtLayout(normalized);

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
    if (
      buf &&
      (candidate.length > charsPerPage || estimateVisualLines(candidate) > maxLinesPerPage)
    ) {
      flush();
      if (block.length > charsPerPage * 1.2 || estimateVisualLines(block) > maxLinesPerPage * 1.15) {
        pages.push(...splitLongTxtBlock(block, charsPerPage, maxLinesPerPage));
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

function fallbackTocItems(pages: string[]) {
  if (pages.length === 0) return [];
  const step = Math.max(1, Math.ceil(pages.length / MAX_FALLBACK_TOC_ITEMS));
  const items: { title: string; page: number }[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < pages.length; index += step) {
    const lines = pages[index].split("\n").map((line) => line.trim()).filter(Boolean);
    const sample =
      lines.find((line) => line.length >= 6) ??
      lines[0] ??
      `Лист ${index + 1}`;
    const title = sample.replace(/\s+/g, " ").slice(0, 68).trim();
    const key = `${index + 1}:${title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ title, page: index + 1 });
  }
  if (items.at(-1)?.page !== pages.length) {
    items.push({ title: `Лист ${pages.length}`, page: pages.length });
  }
  return items;
}

export function headingTocItems(pages: string[]): { title: string; page: number }[] {
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
  return items;
}

export function txtTableOfContents(pages: string[]): {
  title: string;
  page: number;
  kind?: "contents";
}[] {
  const built = buildTextToc(pages, headingTocItems(pages));
  const items: { title: string; page: number; kind?: "contents" }[] = [];
  if (built.contentsPage) {
    items.push({
      title: "Страница оглавления",
      page: built.contentsPage,
      kind: "contents",
    });
  }
  for (const item of qualityTocItems(built.items)) {
    if (!item.page) continue;
    if (built.contentsPage && item.page === built.contentsPage) continue;
    items.push({ title: item.title, page: item.page });
  }
  if (items.length === 0) {
    for (const item of fallbackTocItems(pages)) {
      items.push({ title: item.title, page: item.page });
    }
  }
  return items;
}
