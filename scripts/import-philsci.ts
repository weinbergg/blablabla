/**
 * Additive import for a curated batch of recent open-access papers from
 * PhilSci-Archive (philsci-archive.pitt.edu), harvested via its OAI-PMH
 * endpoint (see /tmp/perseus/parse_philsci.py). Does not touch the existing
 * catalog — only adds a new subcategory/authors/documents.
 *
 * Usage: PHILSCI_SOURCE_DIR=/tmp/perseus/output/philsci npx tsx scripts/import-philsci.ts
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
const SOURCE_DIR = process.env.PHILSCI_SOURCE_DIR || "/tmp/perseus/output/philsci";
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

const FILOSOFIYA_NAUKI = "1e66dc75-ced9-46d3-bbf2-734438184def";
const NEW_CATEGORY_SLUG = "philsci-archive";
const NEW_CATEGORY_NAME = "Статьи (PhilSci-Archive)";

type ManifestItem = { file: string; title: string; authors: string[]; date: string };

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
    .where(and(eq(categories.slug, NEW_CATEGORY_SLUG), eq(categories.parentId, FILOSOFIYA_NAUKI)))
    .limit(1);
  if (existing[0]) return existing[0].id;

  const [{ maxOrder } = { maxOrder: -1 }] = await db
    .select({ maxOrder: sql<number>`max(${categories.sortOrder})` })
    .from(categories)
    .where(eq(categories.parentId, FILOSOFIYA_NAUKI));

  const id = randomUUID();
  await db.insert(categories).values({
    id,
    parentId: FILOSOFIYA_NAUKI,
    slug: NEW_CATEGORY_SLUG,
    name: NEW_CATEGORY_NAME,
    description:
      "Свежие открытые препринты по философии науки, отобранные из PhilSci-Archive (Питтсбургский университет).",
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

async function main() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const categoryId = await ensureCategory();
  const authorCache = new Map<string, string>();

  const manifest: ManifestItem[] = JSON.parse(
    await fs.readFile(path.join(SOURCE_DIR, "_manifest.json"), "utf-8"),
  );

  let imported = 0;
  for (const item of manifest) {
    const dup = await db.select({ id: documents.id }).from(documents).where(eq(documents.title, item.title)).limit(1);
    if (dup[0]) {
      console.log(`  = уже есть в каталоге, пропускаю: ${item.title}`);
      continue;
    }

    const sourcePath = path.join(SOURCE_DIR, item.file);
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

  console.log(`\nГотово. Импортировано: ${imported}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    sqlite.close();
  });
