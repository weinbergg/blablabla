/**
 * One-off import: reorganizes the original BOOKS folder into the site's
 * database + storage, following scripts/catalog-data.ts.
 *
 * Usage: BOOKS_SOURCE_DIR=/path/to/BOOKS npm run db:seed
 * (defaults to /Users/georgij/Desktop/BOOKS)
 */
import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { promisify } from "util";
import { eq } from "drizzle-orm";
import { db, sqlite } from "../lib/db/client";
import {
  authorRelations,
  authors,
  categories,
  categoryRelations,
  comments,
  documentAuthors,
  documentEdits,
  documents,
} from "../lib/db/schema";
import { slugify } from "../lib/transliterate";
import { convertDjvuToPdf } from "../lib/djvu";
import {
  authorRelationSeeds,
  catalog,
  categoryRelationSeeds,
  type CategorySeed,
  type DocSeed,
} from "./catalog-data";

const execFileAsync = promisify(execFile);

const BOOKS_ROOT = process.env.BOOKS_SOURCE_DIR || "/Users/georgij/Desktop/BOOKS";
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

const categoryIdByPath = new Map<string, string>();
const authorIdByName = new Map<string, string>();

const stats = {
  imported: 0,
  skippedMissing: [] as string[],
  lowConfidence: [] as string[],
};

function sanitizeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
}

async function pdfPageCount(filePath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("pdfinfo", [filePath], {
      maxBuffer: 1024 * 1024 * 8,
    });
    const match = stdout.match(/^Pages:\s+(\d+)/m);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

async function getOrCreateAuthor(name: string) {
  const cached = authorIdByName.get(name);
  if (cached) return cached;

  const existing = await db
    .select({ id: authors.id })
    .from(authors)
    .where(eq(authors.slug, slugify(name)))
    .limit(1);

  const id = existing[0]?.id ?? randomUUID();
  if (!existing[0]) {
    await db.insert(authors).values({ id, name, slug: slugify(name) });
  }

  authorIdByName.set(name, id);
  return id;
}

async function insertCategoryTree(
  nodes: CategorySeed[],
  parentId: string | null,
  parentPath: string[],
) {
  for (const [index, node] of nodes.entries()) {
    const id = randomUUID();
    await db.insert(categories).values({
      id,
      parentId,
      slug: node.slug,
      name: node.name,
      description: node.description ?? null,
      sortOrder: index,
    });

    const fullPath = [...parentPath, node.slug];
    categoryIdByPath.set(fullPath.join("/"), id);

    if (node.documents) {
      for (const doc of node.documents) {
        await importDocument(doc, id);
      }
    }

    if (node.children) {
      await insertCategoryTree(node.children, id, fullPath);
    }
  }
}

async function importDocument(doc: DocSeed, categoryId: string) {
  const sourcePath = path.join(BOOKS_ROOT, doc.sourcePath);

  try {
    await fs.access(sourcePath);
  } catch {
    stats.skippedMissing.push(doc.sourcePath);
    console.warn(`  ! файл не найден, пропускаю: ${doc.sourcePath}`);
    return;
  }

  const originalExt = path.extname(sourcePath).toLowerCase();
  const isDjvu = originalExt === ".djvu";
  const storedExt = isDjvu ? ".pdf" : originalExt;
  const storedId = randomUUID();
  const storedPath = path.join(UPLOAD_DIR, `${storedId}${storedExt}`);

  if (isDjvu) {
    await convertDjvuToPdf(sourcePath, storedPath);
  } else {
    await fs.copyFile(sourcePath, storedPath);
  }

  const pages = storedExt === ".pdf" ? await pdfPageCount(storedPath) : null;
  const authorNames = doc.authors ?? [];
  const displayAuthors = authorNames.join(", ");
  const fileName = sanitizeFileName(
    `${displayAuthors ? `${displayAuthors} — ` : ""}${doc.title}${storedExt}`,
  );

  const documentId = randomUUID();
  await db.insert(documents).values({
    id: documentId,
    title: doc.title,
    alternateTitle: doc.alternateTitle ?? null,
    year: doc.year ?? null,
    description: doc.description ?? null,
    categoryId,
    fileUrl: `/uploads/${storedId}${storedExt}`,
    fileName,
    fileType: storedExt.slice(1).toUpperCase(),
    originalFormat: isDjvu ? "DJVU" : null,
    pages,
    confidence: doc.confidence ?? "confirmed",
    sourceNote: doc.sourceNote ?? null,
  });

  for (const [position, name] of authorNames.entries()) {
    const authorId = await getOrCreateAuthor(name);
    await db
      .insert(documentAuthors)
      .values({ documentId, authorId, position })
      .onConflictDoNothing();
  }

  stats.imported += 1;
  if (doc.confidence === "low") {
    stats.lowConfidence.push(`${doc.title} (${doc.sourcePath})`);
  }
}

async function insertRelations() {
  for (const relation of categoryRelationSeeds) {
    const categoryAId = categoryIdByPath.get(relation.a.join("/"));
    const categoryBId = categoryIdByPath.get(relation.b.join("/"));
    if (!categoryAId || !categoryBId) {
      console.warn(`  ! не найдена категория для связи: ${relation.a} <-> ${relation.b}`);
      continue;
    }
    await db.insert(categoryRelations).values({
      id: randomUUID(),
      categoryAId,
      categoryBId,
      label: relation.label,
    });
  }

  for (const relation of authorRelationSeeds) {
    const authorAId = await getOrCreateAuthor(relation.a);
    const authorBId = await getOrCreateAuthor(relation.b);
    await db.insert(authorRelations).values({
      id: randomUUID(),
      authorAId,
      authorBId,
      label: relation.label,
    });
  }
}

async function main() {
  console.log(`Импортирую книги из ${BOOKS_ROOT}...`);
  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  console.log("Очищаю таблицы каталога (пользователи и сессии не трогаю)...");
  await db.delete(comments);
  await db.delete(documentEdits);
  await db.delete(documentAuthors);
  await db.delete(documents);
  await db.delete(categoryRelations);
  await db.delete(authorRelations);
  await db.delete(categories);
  await db.delete(authors);

  await insertCategoryTree(catalog, null, []);
  await insertRelations();

  console.log("\nГотово.");
  console.log(`  Импортировано документов: ${stats.imported}`);
  if (stats.skippedMissing.length) {
    console.log(`  Не найдено файлов (${stats.skippedMissing.length}):`);
    stats.skippedMissing.forEach((item) => console.log(`    - ${item}`));
  }
  if (stats.lowConfidence.length) {
    console.log(
      `  Низкая уверенность в названии/авторе (${stats.lowConfidence.length}), стоит проверить в /admin:`,
    );
    stats.lowConfidence.forEach((item) => console.log(`    - ${item}`));
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    sqlite.close();
  });
