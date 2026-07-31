/**
 * Detect Gutenberg-style "TOC of hyperlinks" EPUBs: a short shell whose
 * chapters are mostly <a href> with almost no continuous prose. Those cannot
 * be usefully "converted" to PDF/TXT — the text simply isn't in the file.
 * Prefer rejecting them and falling back to Project Gutenberg plain text.
 */
import { execFileSync } from "child_process";
import { promises as fs } from "fs";

export type EpubQuality = {
  ok: boolean;
  reason?: string;
  linkCount: number;
  wordCount: number;
  sampledFiles: number;
};

function listEntries(epubPath: string): string[] {
  try {
    const out = execFileSync("unzip", ["-Z1", epubPath], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
    return out.split("\n").map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function readEntry(epubPath: string, entry: string): string {
  try {
    return execFileSync("unzip", ["-p", epubPath, entry], {
      encoding: "utf8",
      maxBuffer: 12 * 1024 * 1024,
    });
  } catch {
    return "";
  }
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the EPUB looks like a navigational shell, not continuous prose. */
export function assessEpubQuality(epubPath: string): EpubQuality {
  const entries = listEntries(epubPath);
  if (!entries.length) {
    return { ok: false, reason: "not a readable zip/epub", linkCount: 0, wordCount: 0, sampledFiles: 0 };
  }

  const htmlFiles = entries.filter((e) => /\.(x?html?|xml)$/i.test(e) && !/meta-inf/i.test(e));
  // Prefer spine-like paths; fall back to any html
  const candidates = (
    htmlFiles.filter((e) => !/toc|nav|ncx|cover|titlepage|copyright|about/i.test(e)).length
      ? htmlFiles.filter((e) => !/toc|nav|ncx|cover|titlepage|copyright|about/i.test(e))
      : htmlFiles
  ).slice(0, 24);

  let linkCount = 0;
  let wordCount = 0;
  let sampled = 0;

  for (const entry of candidates) {
    const raw = readEntry(epubPath, entry);
    if (!raw) continue;
    sampled++;
    const links = raw.match(/<a\s[^>]*href=/gi) ?? [];
    linkCount += links.length;
    const text = stripTags(raw);
    wordCount += (text.match(/[A-Za-zА-Яа-яЁё\u0370-\u03FF]{2,}/g) ?? []).length;
  }

  if (sampled === 0) {
    return { ok: false, reason: "no xhtml content", linkCount: 0, wordCount: 0, sampledFiles: 0 };
  }

  // Classic Butler-style shell: dozens of links, almost no words per link.
  if (linkCount >= 40 && wordCount / Math.max(linkCount, 1) < 12) {
    return {
      ok: false,
      reason: `toc-shell (${linkCount} links / ${wordCount} words)`,
      linkCount,
      wordCount,
      sampledFiles: sampled,
    };
  }
  // Tiny body with many links
  if (linkCount >= 25 && wordCount < 800) {
    return {
      ok: false,
      reason: `link-heavy stub (${linkCount} links, ${wordCount} words)`,
      linkCount,
      wordCount,
      sampledFiles: sampled,
    };
  }
  // Essentially empty prose
  if (wordCount < 400 && linkCount >= 10) {
    return {
      ok: false,
      reason: `too little prose (${wordCount} words)`,
      linkCount,
      wordCount,
      sampledFiles: sampled,
    };
  }

  return { ok: true, linkCount, wordCount, sampledFiles: sampled };
}

export async function assessEpubFile(epubPath: string): Promise<EpubQuality> {
  try {
    await fs.access(epubPath);
  } catch {
    return { ok: false, reason: "missing file", linkCount: 0, wordCount: 0, sampledFiles: 0 };
  }
  return assessEpubQuality(epubPath);
}
