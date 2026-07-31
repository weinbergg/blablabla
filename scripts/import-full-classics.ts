/**
 * Curated full-length open-domain EPUBs (Project Gutenberg), with ZIP/magic
 * checks so we never store HTML softblocks. Titles are distinct from earlier
 * imports. Note: the reader shows EPUB *chapters* (spine items), not paper
 * pages — a 20–30 chapter spine is usually a complete book.
 *
 *   npm run import:fullclassics
 */
import { randomUUID } from "crypto";
import { createWriteStream, promises as fs } from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { eq } from "drizzle-orm";
import { db } from "../lib/db/client";
import { authors, categories, documentAuthors, documents } from "../lib/db/schema";
import { normalizeForSearch, slugify } from "../lib/transliterate";
import { buildDisplayFileName } from "../lib/filenames";

const WORK_DIR = process.env.FULL_CLASSICS_DIR || "/tmp/full-classics";
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

type Item = {
  gutenbergId: number;
  title: string;
  alternateTitle?: string;
  authors: string[];
  categorySlug: string;
  language?: string;
  year?: string;
  /** Reject downloads smaller than this (bytes). */
  minBytes?: number;
};

const ITEMS: Item[] = [
  // Long philosophy / science — full PG texts
  { gutenbergId: 61, title: "The Communist Manifesto (full text)", alternateTitle: "Манифест Коммунистической партии", authors: ["Karl Marx", "Friedrich Engels"], categorySlug: "filosofiya", language: "en", year: "1848", minBytes: 80_000 },
  { gutenbergId: 3207, title: "Leviathan (full text)", alternateTitle: "Левиафан", authors: ["Thomas Hobbes"], categorySlug: "filosofiya", language: "en", minBytes: 400_000 },
  { gutenbergId: 1232, title: "The Prince (full text)", alternateTitle: "Государь", authors: ["Niccolò Machiavelli"], categorySlug: "filosofiya", language: "en", minBytes: 100_000 },
  { gutenbergId: 3300, title: "An Inquiry into the Nature and Causes of the Wealth of Nations (full text)", alternateTitle: "Богатство народов", authors: ["Adam Smith"], categorySlug: "filosofiya", language: "en", minBytes: 800_000 },
  { gutenbergId: 4363, title: "Beyond Good and Evil (full text)", alternateTitle: "По ту сторону добра и зла", authors: ["Friedrich Nietzsche"], categorySlug: "filosofiya", language: "en", minBytes: 200_000 },
  { gutenbergId: 1998, title: "Thus Spake Zarathustra (full text)", alternateTitle: "Так говорил Заратустра", authors: ["Friedrich Nietzsche"], categorySlug: "filosofiya", language: "en", minBytes: 300_000 },
  { gutenbergId: 4280, title: "The Critique of Pure Reason (full text)", alternateTitle: "Критика чистого разума", authors: ["Immanuel Kant"], categorySlug: "filosofiya", language: "en", minBytes: 800_000 },
  { gutenbergId: 918, title: "The Problems of Philosophy (full text)", alternateTitle: "Проблемы философии", authors: ["Bertrand Russell"], categorySlug: "filosofiya", language: "en", minBytes: 150_000 },
  { gutenbergId: 5827, title: "The Analysis of Mind (full text)", alternateTitle: "Анализ сознания", authors: ["Bertrand Russell"], categorySlug: "filosofiya", language: "en", minBytes: 200_000 },
  { gutenbergId: 25447, title: "Introduction to Mathematical Philosophy (full text)", alternateTitle: "Введение в математическую философию", authors: ["Bertrand Russell"], categorySlug: "filosofiya", language: "en", minBytes: 200_000 },
  { gutenbergId: 55, title: "The Wonderful Wizard of Oz (full text)", authors: ["L. Frank Baum"], categorySlug: "literatura", language: "en", minBytes: 100_000 },
  { gutenbergId: 2554, title: "Crime and Punishment (full text)", alternateTitle: "Преступление и наказание", authors: ["Fyodor Dostoyevsky"], categorySlug: "literatura", language: "en", minBytes: 500_000 },
  { gutenbergId: 28054, title: "The Brothers Karamazov (full text)", alternateTitle: "Братья Карамазовы", authors: ["Fyodor Dostoyevsky"], categorySlug: "literatura", language: "en", minBytes: 1_000_000 },
  { gutenbergId: 1399, title: "Anna Karenina (full text)", alternateTitle: "Анна Каренина", authors: ["Leo Tolstoy"], categorySlug: "literatura", language: "en", minBytes: 1_000_000 },
  { gutenbergId: 2600, title: "War and Peace (full text)", alternateTitle: "Война и мир", authors: ["Leo Tolstoy"], categorySlug: "literatura", language: "en", minBytes: 2_000_000 },
  { gutenbergId: 996, title: "Don Quixote (full text)", alternateTitle: "Дон Кихот", authors: ["Miguel de Cervantes"], categorySlug: "literatura", language: "en", minBytes: 1_000_000 },
  { gutenbergId: 1342, title: "Pride and Prejudice (full text)", alternateTitle: "Гордость и предубеждение", authors: ["Jane Austen"], categorySlug: "literatura", language: "en", minBytes: 400_000 },
  { gutenbergId: 84, title: "Frankenstein (full text)", authors: ["Mary Shelley"], categorySlug: "literatura", language: "en", minBytes: 200_000 },
  { gutenbergId: 11, title: "Alice’s Adventures in Wonderland (full text)", authors: ["Lewis Carroll"], categorySlug: "literatura", language: "en", minBytes: 80_000 },
  { gutenbergId: 174, title: "The Picture of Dorian Gray (full text)", authors: ["Oscar Wilde"], categorySlug: "literatura", language: "en", minBytes: 200_000 },
  { gutenbergId: 345, title: "Dracula (full text)", authors: ["Bram Stoker"], categorySlug: "literatura", language: "en", minBytes: 400_000 },
  { gutenbergId: 98, title: "A Tale of Two Cities (full text)", authors: ["Charles Dickens"], categorySlug: "literatura", language: "en", minBytes: 400_000 },
  { gutenbergId: 1661, title: "The Adventures of Sherlock Holmes (full text)", authors: ["Arthur Conan Doyle"], categorySlug: "literatura", language: "en", minBytes: 400_000 },
  { gutenbergId: 2701, title: "Moby Dick; Or, The Whale (full text)", authors: ["Herman Melville"], categorySlug: "literatura", language: "en", minBytes: 800_000 },
  { gutenbergId: 5200, title: "Metamorphosis (full text)", alternateTitle: "Превращение", authors: ["Franz Kafka"], categorySlug: "literatura", language: "en", minBytes: 80_000 },
  { gutenbergId: 6130, title: "The Iliad (Butler, full text)", alternateTitle: "Илиада", authors: ["Homer"], categorySlug: "antichnaya-literatura", language: "en", minBytes: 400_000 },
  { gutenbergId: 1727, title: "The Odyssey (Butler, full text)", alternateTitle: "Одиссея", authors: ["Homer"], categorySlug: "antichnaya-literatura", language: "en", minBytes: 400_000 },
  { gutenbergId: 1497, title: "The Republic (Jowett, full text)", alternateTitle: "Государство", authors: ["Plato"], categorySlug: "antichnaya-filosofiya-teksty", language: "en", minBytes: 400_000 },
  { gutenbergId: 8438, title: "Nicomachean Ethics (full text)", alternateTitle: "Никомахова этика", authors: ["Aristotle"], categorySlug: "antichnaya-filosofiya-teksty", language: "en", minBytes: 300_000 },
  { gutenbergId: 2680, title: "Meditations (full text)", alternateTitle: "Размышления", authors: ["Marcus Aurelius"], categorySlug: "antichnaya-filosofiya-teksty", language: "en", minBytes: 200_000 },
  { gutenbergId: 1228, title: "On the Origin of Species (full text)", alternateTitle: "Происхождение видов", authors: ["Charles Darwin"], categorySlug: "estestvoznanie-klassika", language: "en", year: "1859", minBytes: 800_000 },
  { gutenbergId: 2300, title: "The Descent of Man (full text)", alternateTitle: "Происхождение человека", authors: ["Charles Darwin"], categorySlug: "estestvoznanie-klassika", language: "en", minBytes: 800_000 },
  { gutenbergId: 4367, title: "The Interpretation of Dreams (full text)", alternateTitle: "Толкование сновидений", authors: ["Sigmund Freud"], categorySlug: "psikhologiya", language: "en", minBytes: 400_000 },
  { gutenbergId: 57628, title: "The Principles of Psychology (full text, vol. context)", alternateTitle: "Принципы психологии", authors: ["William James"], categorySlug: "psikhologiya", language: "en", minBytes: 400_000 },
];

async function download(url: string, dest: string, minBytes: number): Promise<boolean> {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "blablablarden-library-import/1.0 (personal; open-domain corpus)" },
      redirect: "follow",
    });
    if (!res.ok || !res.body) {
      console.log(`  ! HTTP ${res.status}`);
      return false;
    }
    const ctype = (res.headers.get("content-type") ?? "").toLowerCase();
    if (ctype.includes("text/html") || ctype.includes("xhtml")) {
      console.log(`  ! HTML softblock, skip`);
      return false;
    }
    const nodeStream = Readable.fromWeb(res.body as import("stream/web").ReadableStream);
    await pipeline(nodeStream, createWriteStream(dest));
    const stat = await fs.stat(dest);
    if (stat.size < minBytes) {
      console.log(`  ! too small (${stat.size} < ${minBytes})`);
      await fs.unlink(dest).catch(() => undefined);
      return false;
    }
    const fd = await fs.open(dest, "r");
    const buf = Buffer.alloc(4);
    await fd.read(buf, 0, 4, 0);
    await fd.close();
    if (buf[0] !== 0x50 || buf[1] !== 0x4b) {
      console.log(`  ! not EPUB/ZIP`);
      await fs.unlink(dest).catch(() => undefined);
      return false;
    }
    return true;
  } catch (error) {
    console.log(`  ! ${(error as Error).message}`);
    return false;
  }
}

async function downloadGutenberg(id: number, dest: string, minBytes: number): Promise<boolean> {
  const candidates = [
    `https://www.gutenberg.org/cache/epub/${id}/pg${id}-images.epub`,
    `https://www.gutenberg.org/cache/epub/${id}/pg${id}.epub`,
    `https://www.gutenberg.org/ebooks/${id}.epub.images`,
    `https://www.gutenberg.org/ebooks/${id}.epub.noimages`,
  ];
  for (const url of candidates) {
    if (await download(url, dest, minBytes)) return true;
  }
  return false;
}

async function getOrCreateAuthor(name: string): Promise<string> {
  const slug = slugify(name);
  const [existing] = await db.select({ id: authors.id }).from(authors).where(eq(authors.slug, slug)).limit(1);
  if (existing) return existing.id;
  const id = randomUUID();
  await db.insert(authors).values({ id, name, slug });
  return id;
}

function normalizeTitle(title: string) {
  return normalizeForSearch(title).replace(/[^a-z0-9а-яё]+/gi, " ").trim();
}

async function main() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.mkdir(WORK_DIR, { recursive: true });

  const allDocs = await db.select({ id: documents.id, title: documents.title }).from(documents);
  const byTitle = new Set(allDocs.map((d) => normalizeTitle(d.title)));
  const cats = await db.select({ id: categories.id, slug: categories.slug }).from(categories);
  const catBySlug = new Map(cats.map((c) => [c.slug, c.id]));

  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of ITEMS) {
    if (byTitle.has(normalizeTitle(item.title))) {
      console.log(`= skip: ${item.title}`);
      skipped++;
      continue;
    }
    const categoryId = catBySlug.get(item.categorySlug);
    if (!categoryId) {
      console.log(`! no category ${item.categorySlug}`);
      failed++;
      continue;
    }

    console.log(`→ ${item.title}`);
    const dest = path.join(WORK_DIR, `pg${item.gutenbergId}.epub`);
    const ok = await downloadGutenberg(item.gutenbergId, dest, item.minBytes ?? 80_000);
    if (!ok) {
      failed++;
      continue;
    }

    const storedId = randomUUID();
    const storedName = `${storedId}.epub`;
    await fs.copyFile(dest, path.join(UPLOAD_DIR, storedName));
    const displayName = buildDisplayFileName(item.title, item.authors, ".epub");
    const docId = randomUUID();
    const size = (await fs.stat(dest)).size;

    await db.insert(documents).values({
      id: docId,
      title: item.title,
      alternateTitle: item.alternateTitle ?? null,
      year: item.year ?? null,
      description: `Полный текст Project Gutenberg (№${item.gutenbergId}). В читалке «глава N / M» — это разделы EPUB, не бумажные страницы.`,
      categoryId,
      fileUrl: `/uploads/${storedName}`,
      fileName: displayName,
      fileType: "EPUB",
      language: item.language ?? "en",
      confidence: "confirmed",
      sourceNote: `Project Gutenberg #${item.gutenbergId}`,
    });

    let pos = 0;
    for (const name of item.authors) {
      const authorId = await getOrCreateAuthor(name);
      await db.insert(documentAuthors).values({ documentId: docId, authorId, position: pos++ });
    }

    byTitle.add(normalizeTitle(item.title));
    imported++;
    console.log(`  ✓ ${(size / 1024).toFixed(0)} KB`);
  }

  console.log(`\nDone. imported=${imported} skipped=${skipped} failed=${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
