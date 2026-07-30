/**
 * Second additive batch on top of scripts/import-antiquity.ts and
 * scripts/import-philsci.ts:
 *  - Xenophon's Socratic works (Perseus, Greek + English) -> existing
 *    "Античная философия" category.
 *  - Medieval Latin philosophy/theology (Augustine, Anselm, Abelard, Aquinas
 *    — scraped from The Latin Library, Latin only) -> new "Средневековая
 *    философия" category.
 *  - A second, larger haul of PhilSci-Archive papers -> existing
 *    "Статьи (PhilSci-Archive)" category.
 *
 * Usage: npx tsx scripts/import-antiquity-batch2.ts
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
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

const FILOSOFIYA_ROOT = "13768ea5-2eae-4303-ad94-dae77a469adf";
const ANTICHNAYA_FILOSOFIYA = "ce17bc43-6962-4cb8-b464-87c2b23117ca";
const PHILSCI_ARCHIVE = "dc8e48cf-5b01-4564-b532-7d9a103c0332";

const MEDIEVAL_SLUG = "srednevekovaya-filosofiya";
const MEDIEVAL_NAME = "Средневековая философия";

async function pdfPageCount(filePath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("pdfinfo", [filePath], { maxBuffer: 1024 * 1024 * 8 });
    const match = stdout.match(/^Pages:\s+(\d+)/m);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

async function ensureMedievalCategory(): Promise<string> {
  const existing = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.slug, MEDIEVAL_SLUG), eq(categories.parentId, FILOSOFIYA_ROOT)))
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
    slug: MEDIEVAL_SLUG,
    name: MEDIEVAL_NAME,
    description:
      "От Августина до Фомы Аквинского — латинские тексты в оригинале, из The Latin Library.",
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

async function importSimpleBatch(opts: {
  sourceDir: string;
  categoryId: string;
  sourceNote: string;
  authorCache: Map<string, string>;
}): Promise<number> {
  const { sourceDir, categoryId, sourceNote, authorCache } = opts;
  let imported = 0;
  const files = (await fs.readdir(sourceDir)).filter((f) => f.toLowerCase().endsWith(".pdf"));

  for (const file of files) {
    const base = file.replace(/\.pdf$/i, "");
    const idx = base.indexOf(" - ");
    if (idx === -1) {
      console.warn(`  ! не смог разобрать имя файла: ${file}`);
      continue;
    }
    const author = base.slice(0, idx).trim();
    const title = base.slice(idx + 3).trim();

    const dup = await db.select({ id: documents.id }).from(documents).where(eq(documents.title, title)).limit(1);
    if (dup[0]) {
      console.log(`  = уже есть в каталоге, пропускаю: ${title}`);
      continue;
    }

    const sourcePath = path.join(sourceDir, file);
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
  return imported;
}

type PhilsciManifestItem = { file: string; title: string; authors: string[]; date: string };

function lastFirstToDisplay(name: string): string {
  const idx = name.indexOf(",");
  if (idx === -1) return name.trim();
  const last = name.slice(0, idx).trim();
  const first = name.slice(idx + 1).trim();
  return first ? `${first} ${last}` : last;
}

function extractYear(date: string): string | null {
  const match = date.match(/(19|20)\d{2}/);
  return match ? match[0] : null;
}

async function importPhilsciBatch(sourceDir: string, categoryId: string, authorCache: Map<string, string>): Promise<number> {
  const manifest: PhilsciManifestItem[] = JSON.parse(
    await fs.readFile(path.join(sourceDir, "_manifest.json"), "utf-8"),
  );

  let imported = 0;
  for (const item of manifest) {
    const dup = await db.select({ id: documents.id }).from(documents).where(eq(documents.title, item.title)).limit(1);
    if (dup[0]) {
      console.log(`  = уже есть в каталоге, пропускаю: ${item.title}`);
      continue;
    }

    const sourcePath = path.join(sourceDir, item.file);
    try {
      await fs.access(sourcePath);
    } catch {
      continue;
    }

    const storedId = randomUUID();
    const storedPath = path.join(UPLOAD_DIR, `${storedId}.pdf`);
    await fs.copyFile(sourcePath, storedPath);

    const pages = await pdfPageCount(storedPath);
    const authorNames = item.authors.map(lastFirstToDisplay);
    const fileName = buildDisplayFileName(item.title, authorNames, ".pdf");

    const documentId = randomUUID();
    await db.insert(documents).values({
      id: documentId,
      title: item.title,
      year: extractYear(item.date),
      categoryId,
      fileUrl: `/uploads/${storedId}.pdf`,
      fileName,
      fileType: "PDF",
      pages,
      confidence: "confirmed",
      sourceNote: "PhilSci-Archive (philsci-archive.pitt.edu) — открытый доступ.",
    });

    for (const [position, name] of authorNames.entries()) {
      const authorId = await getOrCreateAuthor(name, authorCache);
      await db.insert(documentAuthors).values({ documentId, authorId, position }).onConflictDoNothing();
    }

    imported += 1;
    console.log(`  + ${authorNames.join(", ")} — ${item.title}`);
  }
  return imported;
}

async function main() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const authorCache = new Map<string, string>();
  const medievalCategoryId = await ensureMedievalCategory();

  console.log("Ксенофонт (Perseus)...");
  const xenophonCount = await importSimpleBatch({
    sourceDir: "/tmp/perseus/output/xenophon",
    categoryId: ANTICHNAYA_FILOSOFIYA,
    sourceNote:
      "Perseus Digital Library (PerseusDL/canonical-greekLit) — греческий текст и английский перевод, общественное достояние.",
    authorCache,
  });

  console.log("\nСредневековая латинская философия (The Latin Library)...");
  const medievalCount = await importSimpleBatch({
    sourceDir: "/tmp/perseus/output/medieval_latin",
    categoryId: medievalCategoryId,
    sourceNote: "The Latin Library — латинский текст, общественное достояние.",
    authorCache,
  });

  console.log("\nPhilSci-Archive, вторая партия...");
  const philsciCount = await importPhilsciBatch("/tmp/perseus/output/philsci2", PHILSCI_ARCHIVE, authorCache);

  console.log(
    `\nГотово. Ксенофонт: ${xenophonCount}. Средневековье: ${medievalCount}. PhilSci: ${philsciCount}. Всего: ${
      xenophonCount + medievalCount + philsciCount
    }.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    sqlite.close();
  });
