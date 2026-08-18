/**
 * Build or find tables of contents from files already in the library.
 * Does not delete anything. Prints a report; with --apply stores JSON on
 * documents.toc_json when that column exists.
 *
 *   npx tsx scripts/extract-toc.ts
 *   npx tsx scripts/extract-toc.ts --apply
 */
import { execFileSync } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { db, sqlite } from "../lib/db/client";
import { documents } from "../lib/db/schema";
import { splitTxtPages, txtTableOfContents } from "../lib/txt-structure";
import { buildTextToc } from "../lib/toc-from-text";

const APPLY = process.argv.includes("--apply");

type StoredToc = {
  contentsPage: number | null;
  items: { title: string; page?: number; href?: string }[];
  source: string;
};

function diskPath(fileUrl: string | null) {
  if (!fileUrl?.startsWith("/uploads/")) return null;
  return path.join(process.cwd(), "public", fileUrl.replace(/^\//, ""));
}

function extractEpubNav(epubPath: string): StoredToc {
  let listing = "";
  try {
    listing = execFileSync("unzip", ["-Z1", epubPath], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch {
    return { contentsPage: null, items: [], source: "epub-missing" };
  }
  const entries = listing.split("\n").map((line) => line.trim()).filter(Boolean);
  const navEntry =
    entries.find((entry) => /toc\.ncx$/i.test(entry)) ??
    entries.find((entry) => /(nav|toc)\.x?html?$/i.test(entry));
  if (!navEntry) return { contentsPage: null, items: [], source: "epub-no-nav" };

  let raw = "";
  try {
    raw = execFileSync("unzip", ["-p", epubPath, navEntry], {
      encoding: "utf8",
      maxBuffer: 12 * 1024 * 1024,
    });
  } catch {
    return { contentsPage: null, items: [], source: "epub-unreadable" };
  }

  const items: StoredToc["items"] = [];
  const ncx = raw.matchAll(/<text[^>]*>([^<]+)<\/text>/gi);
  for (const match of ncx) {
    const title = match[1].replace(/\s+/g, " ").trim();
    if (title.length >= 2 && title.length < 120) items.push({ title });
  }
  if (items.length < 2) {
    const anchors = raw.matchAll(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi);
    for (const match of anchors) {
      const title = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (title.length >= 2 && title.length < 120) items.push({ title, href: match[1] });
    }
  }
  return {
    contentsPage: null,
    items: items.slice(0, 200),
    source: navEntry,
  };
}

async function extractPdf(filePath: string): Promise<StoredToc> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await fs.readFile(filePath));
  const doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
  const outline = await doc.getOutline();
  const items: StoredToc["items"] = [];
  async function walk(nodes: { title?: string; dest?: unknown; items?: unknown[] }[]) {
    for (const node of nodes) {
      try {
        let dest = node.dest;
        if (typeof dest === "string") dest = await doc.getDestination(dest);
        if (Array.isArray(dest) && dest[0]) {
          const idx = await doc.getPageIndex(dest[0] as never);
          items.push({ title: (node.title || "Раздел").replace(/\s+/g, " ").trim(), page: idx + 1 });
        }
      } catch {
        /* skip */
      }
      if (node.items?.length) await walk(node.items as { title?: string; dest?: unknown; items?: unknown[] }[]);
    }
  }
  if (outline?.length) await walk(outline);

  const textPages: string[] = [];
  const scan = Math.min(16, doc.numPages);
  for (let i = 1; i <= scan; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    textPages.push((content.items as { str?: string }[]).map((item) => item.str ?? "").join(" "));
  }
  const scanned = buildTextToc(textPages, []);
  return {
    contentsPage: scanned.contentsPage,
    items: items.length ? items : scanned.items,
    source: items.length ? "pdf-outline" : "pdf-contents-page",
  };
}

async function extractTxt(filePath: string): Promise<StoredToc> {
  const raw = await fs.readFile(filePath, "utf8");
  const pages = splitTxtPages(raw);
  const toc = txtTableOfContents(pages);
  return {
    contentsPage: toc.find((item) => item.kind === "contents")?.page ?? null,
    items: toc.map((item) => ({ title: item.title, page: item.page })),
    source: "txt",
  };
}

function hasTocColumn() {
  const cols = sqlite.prepare("PRAGMA table_info(documents)").all() as { name: string }[];
  return cols.some((col) => col.name === "toc_json");
}

async function main() {
  const rows = await db
    .select({
      id: documents.id,
      title: documents.title,
      fileUrl: documents.fileUrl,
      fileType: documents.fileType,
    })
    .from(documents);

  const canApply = APPLY && hasTocColumn();
  if (APPLY && !canApply) {
    console.log("--apply ignored: documents.toc_json column is missing");
  }

  let withToc = 0;
  let withContentsPage = 0;

  for (const row of rows) {
    const disk = diskPath(row.fileUrl);
    if (!disk) continue;
    try {
      await fs.access(disk);
    } catch {
      continue;
    }

    let toc: StoredToc;
    try {
      if (row.fileType === "TXT") toc = await extractTxt(disk);
      else if (row.fileType === "EPUB") toc = extractEpubNav(disk);
      else if (row.fileType === "PDF") toc = await extractPdf(disk);
      else continue;
    } catch (error) {
      console.log(`! ${row.title}: ${error instanceof Error ? error.message : error}`);
      continue;
    }

    if (!toc.items.length && !toc.contentsPage) continue;
    withToc += 1;
    if (toc.contentsPage) withContentsPage += 1;
    console.log(
      `· ${row.title} [${row.fileType}] ${toc.items.length} pts` +
        (toc.contentsPage ? ` · contents p.${toc.contentsPage}` : "") +
        ` (${toc.source})`,
    );

    if (canApply) {
      sqlite
        .prepare("UPDATE documents SET toc_json = ? WHERE id = ?")
        .run(JSON.stringify(toc), row.id);
    }
  }

  console.log(`\nFound TOC in ${withToc} files, contents page in ${withContentsPage}.`);
  if (canApply) console.log("Saved to documents.toc_json.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sqlite.close());
