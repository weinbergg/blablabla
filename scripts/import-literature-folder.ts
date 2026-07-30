/**
 * Additive import for a one-off batch of books (originally dropped by the
 * user into the local, git-ignored `литература/` folder as a handful of
 * zips). Unlike scripts/seed.ts this does NOT wipe the catalog — it only
 * adds new categories/authors/documents on top of what's already there.
 *
 * Usage: LIT_SOURCE_DIR=/tmp/lit-staging/final npx tsx scripts/import-literature-folder.ts
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
const SOURCE_DIR = process.env.LIT_SOURCE_DIR || "/tmp/lit-staging/final";
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

// Existing category ids, read once from the live DB (see chat for how these
// were found: sqlite3 data/app.db "select id, slug, name from categories").
const CATEGORY = {
  filosofiyaMatematiki: "728d6d20-73c0-4b1a-b5d1-9168400c2065",
  filosofiyaYazyka: "ca2e020d-7d06-4d17-9d25-22018a7062d8",
  filosofiyaNauki: "1e66dc75-ced9-46d3-bbf2-734438184def",
  filosofiyaRoot: "13768ea5-2eae-4303-ad94-dae77a469adf",
  teoriyaInfoKnigi: "42455031-7a98-4d75-8b80-064ec51741e6",
  mashinnoeObuchenie: "f5981d1d-9633-4d85-9fc6-5b4899a0146e",
};

type Item = {
  file: string;
  title: string;
  authorNames: string[];
  year?: string;
  description?: string;
  categoryId: string;
};

// A new subcategory for the "what is intelligence / how do minds work"
// cluster — doesn't fit cleanly under any existing philosophy subsection.
const NEW_CATEGORY_SLUG = "filosofiya-soznaniya-i-ii";
const NEW_CATEGORY_NAME = "Философия сознания и искусственного интеллекта";

const ITEMS: Omit<Item, "categoryId">[] = [
  {
    file: "Alexander Shen, Vladimir A. Uspensky, Nikolay Vereshchagin - Kolmogorov Complexity and Algorithmic Randomness.pdf",
    title: "Kolmogorov Complexity and Algorithmic Randomness",
    authorNames: ["Alexander Shen", "Vladimir A. Uspensky", "Nikolay Vereshchagin"],
  },
  {
    file: "Ming Li, Paul M. B. Vitányi - Kolmogorov Complexity and Its Applications.pdf",
    title: "Kolmogorov Complexity and Its Applications",
    authorNames: ["Ming Li", "Paul M. B. Vitányi"],
  },
  {
    file: "Jorma Rissanen - An Introduction to the MDL Principle.pdf",
    title: "An Introduction to the MDL Principle",
    authorNames: ["Jorma Rissanen"],
  },
  {
    file: "Peter D. Grünwald - The Minimum Description Length Principle.pdf",
    title: "The Minimum Description Length Principle",
    authorNames: ["Peter D. Grünwald"],
  },
  {
    file: "Richard S. Sutton, Andrew G. Barto - Reinforcement Learning - An Introduction (Second Edition).pdf",
    title: "Reinforcement Learning: An Introduction",
    authorNames: ["Richard S. Sutton", "Andrew G. Barto"],
    year: "2018",
  },
  {
    file: "W. V. Quine - Two Dogmas of Empiricism.pdf",
    title: "Two Dogmas of Empiricism",
    authorNames: ["W. V. Quine"],
    year: "1951",
  },
  {
    file: "Judea Pearl - Causal Inference in Statistics - An Overview.pdf",
    title: "Causal Inference in Statistics: An Overview",
    authorNames: ["Judea Pearl"],
  },
  {
    file: "Judea Pearl - Causality - Models, Reasoning, and Inference (Second Edition).pdf",
    title: "Causality: Models, Reasoning, and Inference",
    authorNames: ["Judea Pearl"],
    year: "2009",
  },
  {
    file: "Judea Pearl - The Logic of Counterfactuals in Causal Inference.pdf",
    title: "The Logic of Counterfactuals in Causal Inference",
    authorNames: ["Judea Pearl"],
  },
  {
    file: "Stewart Shapiro (ed.) - The Oxford Handbook of Philosophy of Mathematics and Logic.pdf",
    title: "The Oxford Handbook of Philosophy of Mathematics and Logic",
    authorNames: ["Stewart Shapiro"],
  },
  {
    file: "Vladimir Tasic - Mathematics and the Roots of Postmodern Thought.pdf",
    title: "Mathematics and the Roots of Postmodern Thought",
    authorNames: ["Vladimir Tasic"],
  },
  {
    file: "Elizabeth S. Spelke, Katherine D. Kinzler - Core Knowledge.pdf",
    title: "Core Knowledge",
    authorNames: ["Elizabeth S. Spelke", "Katherine D. Kinzler"],
  },
  {
    file: "Francois Chollet - On the Measure of Intelligence.pdf",
    title: "On the Measure of Intelligence",
    authorNames: ["Francois Chollet"],
  },
  {
    file: "Shane Legg, Marcus Hutter - Universal Intelligence.pdf",
    title: "Universal Intelligence: A Definition of Machine Intelligence",
    authorNames: ["Shane Legg", "Marcus Hutter"],
  },
  {
    file: "José Hernández-Orallo - The Measure of All Minds.pdf",
    title: "The Measure of All Minds",
    authorNames: ["José Hernández-Orallo"],
  },
];

const CATEGORY_BY_FILE: Record<string, keyof typeof CATEGORY | "new"> = {
  "Alexander Shen, Vladimir A. Uspensky, Nikolay Vereshchagin - Kolmogorov Complexity and Algorithmic Randomness.pdf":
    "teoriyaInfoKnigi",
  "Ming Li, Paul M. B. Vitányi - Kolmogorov Complexity and Its Applications.pdf": "teoriyaInfoKnigi",
  "Jorma Rissanen - An Introduction to the MDL Principle.pdf": "teoriyaInfoKnigi",
  "Peter D. Grünwald - The Minimum Description Length Principle.pdf": "teoriyaInfoKnigi",
  "Richard S. Sutton, Andrew G. Barto - Reinforcement Learning - An Introduction (Second Edition).pdf":
    "mashinnoeObuchenie",
  "W. V. Quine - Two Dogmas of Empiricism.pdf": "filosofiyaYazyka",
  "Judea Pearl - Causal Inference in Statistics - An Overview.pdf": "filosofiyaNauki",
  "Judea Pearl - Causality - Models, Reasoning, and Inference (Second Edition).pdf": "filosofiyaNauki",
  "Judea Pearl - The Logic of Counterfactuals in Causal Inference.pdf": "filosofiyaNauki",
  "Stewart Shapiro (ed.) - The Oxford Handbook of Philosophy of Mathematics and Logic.pdf": "filosofiyaMatematiki",
  "Vladimir Tasic - Mathematics and the Roots of Postmodern Thought.pdf": "filosofiyaMatematiki",
  "Elizabeth S. Spelke, Katherine D. Kinzler - Core Knowledge.pdf": "new",
  "Francois Chollet - On the Measure of Intelligence.pdf": "new",
  "Shane Legg, Marcus Hutter - Universal Intelligence.pdf": "new",
  "José Hernández-Orallo - The Measure of All Minds.pdf": "new",
};

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

async function ensureNewCategory(): Promise<string> {
  const existing = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.slug, NEW_CATEGORY_SLUG), eq(categories.parentId, CATEGORY.filosofiyaRoot)))
    .limit(1);
  if (existing[0]) return existing[0].id;

  const [{ maxOrder } = { maxOrder: -1 }] = await db
    .select({ maxOrder: sql<number>`max(${categories.sortOrder})` })
    .from(categories)
    .where(eq(categories.parentId, CATEGORY.filosofiyaRoot));

  const id = randomUUID();
  await db.insert(categories).values({
    id,
    parentId: CATEGORY.filosofiyaRoot,
    slug: NEW_CATEGORY_SLUG,
    name: NEW_CATEGORY_NAME,
    description:
      "Что такое интеллект и как его измерять — от формальных определений (Легг и Хаттер) до когнитивистики (Спелке) и философии ИИ (Шолле, Эрнандес-Оралло).",
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
  const newCategoryId = await ensureNewCategory();
  const authorCache = new Map<string, string>();

  let imported = 0;
  const skipped: string[] = [];

  for (const item of ITEMS) {
    const key = CATEGORY_BY_FILE[item.file];
    const categoryId = key === "new" ? newCategoryId : CATEGORY[key];
    const sourcePath = path.join(SOURCE_DIR, item.file);

    try {
      await fs.access(sourcePath);
    } catch {
      skipped.push(item.file);
      console.warn(`  ! файл не найден, пропускаю: ${item.file}`);
      continue;
    }

    // Skip if a document with this exact title already exists (idempotent re-runs).
    const dup = await db.select({ id: documents.id }).from(documents).where(eq(documents.title, item.title)).limit(1);
    if (dup[0]) {
      console.log(`  = уже есть в каталоге, пропускаю: ${item.title}`);
      continue;
    }

    const storedId = randomUUID();
    const storedPath = path.join(UPLOAD_DIR, `${storedId}.pdf`);
    await fs.copyFile(sourcePath, storedPath);

    const pages = await pdfPageCount(storedPath);
    const fileName = buildDisplayFileName(item.title, item.authorNames, ".pdf");

    const documentId = randomUUID();
    await db.insert(documents).values({
      id: documentId,
      title: item.title,
      year: item.year ?? null,
      description: item.description ?? null,
      categoryId,
      fileUrl: `/uploads/${storedId}.pdf`,
      fileName,
      fileType: "PDF",
      pages,
      confidence: "confirmed",
      sourceNote: "Импортировано из личной подборки пользователя (папка «литература»).",
    });

    for (const [position, name] of item.authorNames.entries()) {
      const authorId = await getOrCreateAuthor(name, authorCache);
      await db.insert(documentAuthors).values({ documentId, authorId, position }).onConflictDoNothing();
    }

    imported += 1;
    console.log(`  + ${item.title}`);
  }

  console.log(`\nГотово. Импортировано: ${imported}. Пропущено: ${skipped.length}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    sqlite.close();
  });
