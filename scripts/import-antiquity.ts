/**
 * Additive import for the "Античная философия" batch — public-domain texts
 * pulled from PerseusDL (canonical-greekLit, TEI-XML, Greek + English where
 * available) and The Latin Library (static HTML, Latin only), converted to
 * PDF by tmp/perseus/convert.py and tmp/perseus/scrape_latin_library.py.
 * Does NOT touch the existing catalog — only adds a new category/authors/docs.
 *
 * Usage: ANTIQUITY_SOURCE_DIR=/tmp/perseus/output npx tsx scripts/import-antiquity.ts
 */
import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { promisify } from "util";
import { eq, and, sql } from "drizzle-orm";
import { db, sqlite } from "../lib/db/client";
import { authors, categories, documentAuthors, documents } from "../lib/db/schema";
import { slugify } from "../lib/transliterate";
import { buildDisplayFileName } from "../lib/filenames";

const execFileAsync = promisify(execFile);
const SOURCE_DIR = process.env.ANTIQUITY_SOURCE_DIR || "/tmp/perseus/output";
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

const FILOSOFIYA_ROOT = "13768ea5-2eae-4303-ad94-dae77a469adf";
const NEW_CATEGORY_SLUG = "antichnaya-filosofiya";
const NEW_CATEGORY_NAME = "Античная философия";

const SOURCE_NOTE: Record<string, string> = {
  plato: "Perseus Digital Library (PerseusDL/canonical-greekLit) — греческий текст и английский перевод, общественное достояние.",
  aristotle: "Perseus Digital Library (PerseusDL/canonical-greekLit) — греческий текст и английский перевод, общественное достояние.",
  epictetus: "Perseus Digital Library (PerseusDL/canonical-greekLit) — греческий текст и английский перевод, общественное достояние.",
  marcus_aurelius:
    "Греческий текст — Perseus Digital Library; английский перевод — Дж. Лонг, 1862 (Project Gutenberg, общественное достояние).",
  diogenes_laertius: "Perseus Digital Library (PerseusDL/canonical-greekLit) — греческий текст и английский перевод, общественное достояние.",
  latin_library: "The Latin Library — латинский текст, общественное достояние.",
};

async function pdfPageCount(filePath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("pdfinfo", [filePath], { maxBuffer: 1024 * 1024 * 8 });
    const match = stdout.match(/^Pages:\s+(\d+)/m);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

async function ensureCategory(): Promise<string> {
  const existing = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.slug, NEW_CATEGORY_SLUG), eq(categories.parentId, FILOSOFIYA_ROOT)))
    .limit(1);
  if (existing[0]) return existing[0].id;

  const [{ maxOrder } = { maxOrder: -1 }] = await db
    .select({ maxOrder: sql<number>`max(${categories.sortOrder})` })
    .from(categories)
    .where(eq(categories.parentId, FILOSOFIYA_ROOT));

  const id = randomUUID();
  await db.insert(categories).values({
    id,
    parentId: FILOSOFIYA_ROOT,
    slug: NEW_CATEGORY_SLUG,
    name: NEW_CATEGORY_NAME,
    description:
      "Платон, Аристотель, Эпиктет, Марк Аврелий, Диоген Лаэртский, Цицерон, Сенека, Лукреций — тексты на языке оригинала (где есть — с английским переводом), из Perseus Digital Library и The Latin Library.",
    sortOrder: (maxOrder ?? -1) + 1,
  });
  return id;
}

async function getOrCreateAuthor(name: string, cache: Map<string, string>) {
  const cached = cache.get(name);
  if (cached) return cached;
  const slug = slugify(name);
  const existing = await db.select({ id: authors.id }).from(authors).where(eq(authors.slug, slug)).limit(1);
  const id = existing[0]?.id ?? randomUUID();
  if (!existing[0]) {
    await db.insert(authors).values({ id, name, slug });
  }
  cache.set(name, id);
  return id;
}

function parseFileName(file: string): { author: string; title: string } | null {
  const base = file.replace(/\.pdf$/i, "");
  const idx = base.indexOf(" - ");
  if (idx === -1) return null;
  return { author: base.slice(0, idx).trim(), title: base.slice(idx + 3).trim() };
}

async function main() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const categoryId = await ensureCategory();
  const authorCache = new Map<string, string>();

  let imported = 0;
  let skipped = 0;

  const subdirs = await fs.readdir(SOURCE_DIR, { withFileTypes: true });
  for (const dirent of subdirs) {
    if (!dirent.isDirectory()) continue;
    const subdir = dirent.name;
    const sourceNote = SOURCE_NOTE[subdir] ?? "Импортировано из открытых источников.";
    const dirPath = path.join(SOURCE_DIR, subdir);
    const files = (await fs.readdir(dirPath)).filter((f) => f.toLowerCase().endsWith(".pdf"));

    for (const file of files) {
      const parsed = parseFileName(file);
      if (!parsed) {
        console.warn(`  ! не смог разобрать имя файла: ${file}`);
        skipped += 1;
        continue;
      }
      const { author, title } = parsed;

      const dup = await db.select({ id: documents.id }).from(documents).where(eq(documents.title, title)).limit(1);
      if (dup[0]) {
        console.log(`  = уже есть в каталоге, пропускаю: ${title}`);
        continue;
      }

      const sourcePath = path.join(dirPath, file);
      const storedId = randomUUID();
      const storedPath = path.join(UPLOAD_DIR, `${storedId}.pdf`);
      await fs.copyFile(sourcePath, storedPath);

      const pages = await pdfPageCount(storedPath);
      const fileName = buildDisplayFileName(title, [author], ".pdf");

      const documentId = randomUUID();
      await db.insert(documents).values({
        id: documentId,
        title,
        categoryId,
        fileUrl: `/uploads/${storedId}.pdf`,
        fileName,
        fileType: "PDF",
        pages,
        confidence: "confirmed",
        sourceNote,
      });

      const authorId = await getOrCreateAuthor(author, authorCache);
      await db.insert(documentAuthors).values({ documentId, authorId, position: 0 }).onConflictDoNothing();

      imported += 1;
      console.log(`  + ${author} — ${title}`);
    }
  }

  console.log(`\nГотово. Импортировано: ${imported}. Пропущено: ${skipped}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    sqlite.close();
  });
