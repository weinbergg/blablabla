/**
 * Diagnostic TOC / structure probe. Does not write to the DB.
 *
 *   npx tsx scripts/probe-toc.ts
 *   npx tsx scripts/probe-toc.ts --pdf public/uploads/<id>.pdf
 *   npx tsx scripts/probe-toc.ts --txt public/uploads/<id>.txt
 */
import { promises as fs } from "fs";
import path from "path";
import { db, sqlite } from "../lib/db/client";
import { documents } from "../lib/db/schema";
import { eq } from "drizzle-orm";

const BOOK_HEADING =
  /^(?:book|chapter|canto|part|section|песнь|книга|глава|часть|act|scene)\s+[\divxlcdmа-я0-9]+/i;

async function probePdf(filePath: string) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await fs.readFile(filePath));
  const doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
  const outline = await doc.getOutline();
  const outlineCount = outline ? flattenOutline(outline).length : 0;
  const samplePages = Math.min(8, doc.numPages);
  let headingish = 0;
  for (let i = 1; i <= samplePages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const lines = groupLines(content.items as { str?: string; transform?: number[] }[]);
    headingish += lines.filter((line) => isHeadingLike(line)).length;
  }
  return {
    pages: doc.numPages,
    outlineItems: outlineCount,
    headingishOnFirstPages: headingish,
    outlineSample: outline ? flattenOutline(outline).slice(0, 8) : [],
  };
}

function flattenOutline(
  items: { title?: string; items?: unknown[] }[],
  acc: string[] = [],
): string[] {
  for (const item of items) {
    if (item.title) acc.push(item.title.replace(/\s+/g, " ").trim());
    if (item.items?.length) flattenOutline(item.items as { title?: string; items?: unknown[] }[], acc);
  }
  return acc;
}

function groupLines(items: { str?: string; transform?: number[] }[]) {
  const lines: { text: string; fontSize: number }[] = [];
  let current = "";
  let size = 0;
  let lastY: number | null = null;
  for (const item of items) {
    const y = item.transform?.[5] ?? 0;
    const s = item.transform?.[0] ?? 0;
    if (lastY != null && Math.abs(y - lastY) > 2) {
      if (current.trim()) lines.push({ text: current.trim(), fontSize: size });
      current = "";
      size = 0;
    }
    current += item.str ?? "";
    size = Math.max(size, s);
    lastY = y;
  }
  if (current.trim()) lines.push({ text: current.trim(), fontSize: size });
  return lines;
}

function isHeadingLike(line: { text: string; fontSize: number }) {
  if (line.fontSize >= 14 && line.text.length < 80) return true;
  return BOOK_HEADING.test(line.text);
}

async function probeTxt(filePath: string) {
  const raw = await fs.readFile(filePath, "utf8");
  const lines = raw.split(/\n/);
  const hits: { line: number; text: string }[] = [];
  lines.forEach((text, i) => {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > 80) return;
    if (BOOK_HEADING.test(trimmed)) hits.push({ line: i + 1, text: trimmed.slice(0, 80) });
  });
  const numbered = lines.filter((l) => /^\s*\d{1,3}\s*$/.test(l)).length;
  return {
    chars: raw.length,
    lines: lines.length,
    headingHits: hits.length,
    sample: hits.slice(0, 12),
    loneNumbers: numbered,
  };
}

async function defaultTargets() {
  const pdfs = await db
    .select({ title: documents.title, fileUrl: documents.fileUrl })
    .from(documents)
    .where(eq(documents.fileType, "PDF"))
    .limit(40);
  const txts = await db
    .select({ title: documents.title, fileUrl: documents.fileUrl })
    .from(documents)
    .where(eq(documents.fileType, "TXT"));
  const picks = [
    ...pdfs.filter((d) => d.fileUrl && !d.title.includes("Эшер")).slice(0, 5),
    ...txts.filter((d) => d.fileUrl),
  ];
  return picks.map((d) => ({
    title: d.title,
    path: path.join(process.cwd(), "public", d.fileUrl!),
  }));
}

async function main() {
  const pdfArg = process.argv.find((a) => a.startsWith("--pdf="))?.slice(6);
  const txtArg = process.argv.find((a) => a.startsWith("--txt="))?.slice(6);
  const targets = pdfArg || txtArg
    ? [
        ...(pdfArg ? [{ title: pdfArg, path: path.resolve(pdfArg) }] : []),
        ...(txtArg ? [{ title: txtArg, path: path.resolve(txtArg) }] : []),
      ]
    : await defaultTargets();

  for (const target of targets) {
    const ext = path.extname(target.path).toLowerCase();
    console.log(`\n## ${target.title}`);
    console.log(target.path);
    try {
      if (ext === ".pdf") {
        const result = await probePdf(target.path);
        console.log(
          `pages=${result.pages} outline=${result.outlineItems} headingish(first pages)=${result.headingishOnFirstPages}`,
        );
        for (const item of result.outlineSample) console.log("  ·", item);
      } else {
        const result = await probeTxt(target.path);
        console.log(
          `chars=${result.chars} lines=${result.lines} headingHits=${result.headingHits} loneNumbers=${result.loneNumbers}`,
        );
        for (const hit of result.sample) console.log(`  L${hit.line} ${hit.text}`);
      }
    } catch (error) {
      console.log("  error", error instanceof Error ? error.message : error);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sqlite.close());
