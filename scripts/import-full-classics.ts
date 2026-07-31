/**
 * Curated open-domain corpus: philosophy, mathematics, culturology only.
 * No fiction. EPUB magic/size checks; among Gutenberg mirrors we keep the
 * largest valid file (so real books aren't rejected by a too-high minBytes).
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
  /** Soft floor — real PG EPUBs are often 100–700 KB even when "full". */
  minBytes?: number;
};

const ITEMS: Item[] = [
  // —— Philosophy (modern / early modern) ——
  {
    gutenbergId: 59,
    title: "Discourse on the Method (full text)",
    alternateTitle: "Рассуждение о методе",
    authors: ["René Descartes"],
    categorySlug: "filosofiya",
    language: "en",
    year: "1637",
  },
  {
    gutenbergId: 70091,
    title: "Six Metaphysical Meditations (full text)",
    alternateTitle: "Метафизические размышления",
    authors: ["René Descartes"],
    categorySlug: "filosofiya",
    language: "en",
  },
  {
    gutenbergId: 23306,
    title: "Meditationes de prima philosophia (Latin)",
    alternateTitle: "Размышления о первой философии",
    authors: ["René Descartes"],
    categorySlug: "filosofiya",
    language: "la",
  },
  {
    gutenbergId: 3800,
    title: "Ethics (Spinoza, full text)",
    alternateTitle: "Этика",
    authors: ["Baruch Spinoza"],
    categorySlug: "filosofiya",
    language: "en",
  },
  {
    gutenbergId: 10615,
    title: "An Essay Concerning Humane Understanding, Vol. 1 (full text)",
    alternateTitle: "Опыт о человеческом разумении I",
    authors: ["John Locke"],
    categorySlug: "filosofiya",
    language: "en",
  },
  {
    gutenbergId: 10616,
    title: "An Essay Concerning Humane Understanding, Vol. 2 (full text)",
    alternateTitle: "Опыт о человеческом разумении II",
    authors: ["John Locke"],
    categorySlug: "filosofiya",
    language: "en",
  },
  {
    gutenbergId: 4723,
    title: "Principles of Human Knowledge (full text)",
    alternateTitle: "Трактат о принципах человеческого знания",
    authors: ["George Berkeley"],
    categorySlug: "filosofiya",
    language: "en",
  },
  {
    gutenbergId: 4705,
    title: "A Treatise of Human Nature (full text)",
    alternateTitle: "Трактат о человеческой природе",
    authors: ["David Hume"],
    categorySlug: "filosofiya",
    language: "en",
  },
  {
    gutenbergId: 4280,
    title: "The Critique of Pure Reason (full text)",
    alternateTitle: "Критика чистого разума",
    authors: ["Immanuel Kant"],
    categorySlug: "filosofiya",
    language: "en",
    minBytes: 400_000,
  },
  {
    gutenbergId: 5682,
    title: "Fundamental Principles of the Metaphysic of Morals (full text)",
    alternateTitle: "Основы метафизики нравственности",
    authors: ["Immanuel Kant"],
    categorySlug: "filosofiya",
    language: "en",
  },
  {
    gutenbergId: 5684,
    title: "The Metaphysical Elements of Ethics (full text)",
    alternateTitle: "Метафизические начала учения о добродетели",
    authors: ["Immanuel Kant"],
    categorySlug: "filosofiya",
    language: "en",
  },
  {
    gutenbergId: 38427,
    title: "The World as Will and Idea, Vol. 1 (full text)",
    alternateTitle: "Мир как воля и представление I",
    authors: ["Arthur Schopenhauer"],
    categorySlug: "filosofiya",
    language: "en",
    minBytes: 400_000,
  },
  {
    gutenbergId: 4363,
    title: "Beyond Good and Evil (full text)",
    alternateTitle: "По ту сторону добра и зла",
    authors: ["Friedrich Nietzsche"],
    categorySlug: "filosofiya",
    language: "en",
  },
  {
    gutenbergId: 1998,
    title: "Thus Spake Zarathustra (full text)",
    alternateTitle: "Так говорил Заратустра",
    authors: ["Friedrich Nietzsche"],
    categorySlug: "filosofiya",
    language: "en",
  },
  {
    gutenbergId: 52319,
    title: "The Genealogy of Morals (full text)",
    alternateTitle: "Генеалогия морали",
    authors: ["Friedrich Nietzsche"],
    categorySlug: "filosofiya",
    language: "en",
  },
  {
    gutenbergId: 3207,
    title: "Leviathan (full text)",
    alternateTitle: "Левиафан",
    authors: ["Thomas Hobbes"],
    categorySlug: "filosofiya",
    language: "en",
    minBytes: 400_000,
  },
  {
    gutenbergId: 1232,
    title: "The Prince (full text)",
    alternateTitle: "Государь",
    authors: ["Niccolò Machiavelli"],
    categorySlug: "filosofiya",
    language: "en",
  },
  {
    gutenbergId: 61,
    title: "The Communist Manifesto (full text)",
    alternateTitle: "Манифест Коммунистической партии",
    authors: ["Karl Marx", "Friedrich Engels"],
    categorySlug: "filosofiya",
    language: "en",
    year: "1848",
  },
  {
    gutenbergId: 3300,
    title: "The Wealth of Nations (full text)",
    alternateTitle: "Богатство народов",
    authors: ["Adam Smith"],
    categorySlug: "filosofiya",
    language: "en",
    minBytes: 500_000,
  },
  {
    gutenbergId: 34901,
    title: "On Liberty (full text)",
    alternateTitle: "О свободе",
    authors: ["John Stuart Mill"],
    categorySlug: "filosofiya",
    language: "en",
  },
  {
    gutenbergId: 25788,
    title: "Utilitarianism (full text)",
    alternateTitle: "Утилитаризм",
    authors: ["John Stuart Mill"],
    categorySlug: "filosofiya",
    language: "en",
  },
  {
    gutenbergId: 30107,
    title: "Principles of Political Economy (full text)",
    alternateTitle: "Основы политической экономии",
    authors: ["John Stuart Mill"],
    categorySlug: "filosofiya",
    language: "en",
    minBytes: 800_000,
  },
  {
    gutenbergId: 5827,
    title: "The Problems of Philosophy (Russell, full text)",
    alternateTitle: "Проблемы философии",
    authors: ["Bertrand Russell"],
    categorySlug: "filosofiya",
    language: "en",
  },
  {
    gutenbergId: 2529,
    title: "The Analysis of Mind (full text)",
    alternateTitle: "Анализ сознания",
    authors: ["Bertrand Russell"],
    categorySlug: "filosofiya",
    language: "en",
  },
  {
    gutenbergId: 41654,
    title: "Introduction to Mathematical Philosophy (full text)",
    alternateTitle: "Введение в математическую философию",
    authors: ["Bertrand Russell"],
    categorySlug: "filosofiya-matematiki",
    language: "en",
    minBytes: 400_000,
  },
  {
    gutenbergId: 25447,
    title: "Mysticism and Logic and Other Essays (full text)",
    alternateTitle: "Мистицизм и логика",
    authors: ["Bertrand Russell"],
    categorySlug: "filosofiya",
    language: "en",
  },
  {
    gutenbergId: 26163,
    title: "Creative Evolution (full text)",
    alternateTitle: "Творческая эволюция",
    authors: ["Henri Bergson"],
    categorySlug: "filosofiya",
    language: "en",
  },
  {
    gutenbergId: 5116,
    title: "Pragmatism (full text)",
    alternateTitle: "Прагматизм",
    authors: ["William James"],
    categorySlug: "filosofiya",
    language: "en",
  },
  {
    gutenbergId: 852,
    title: "Democracy and Education (full text)",
    alternateTitle: "Демократия и образование",
    authors: ["John Dewey"],
    categorySlug: "filosofiya",
    language: "en",
  },
  {
    gutenbergId: 37423,
    title: "How We Think (full text)",
    alternateTitle: "Как мы мыслим",
    authors: ["John Dewey"],
    categorySlug: "filosofiya",
    language: "en",
  },
  {
    gutenbergId: 55108,
    title: "Hegel's Logic (full text)",
    alternateTitle: "Логика Гегеля",
    authors: ["Georg Wilhelm Friedrich Hegel"],
    categorySlug: "filosofiya",
    language: "en",
    minBytes: 300_000,
  },
  {
    gutenbergId: 18835,
    title: "The Concept of Nature (full text)",
    alternateTitle: "Понятие природы",
    authors: ["Alfred North Whitehead"],
    categorySlug: "filosofiya",
    language: "en",
  },
  {
    gutenbergId: 39713,
    title: "Science and Hypothesis (full text)",
    alternateTitle: "Наука и гипотеза",
    authors: ["Henri Poincaré"],
    categorySlug: "filosofiya-matematiki",
    language: "en",
    minBytes: 300_000,
  },

  // —— Ancient philosophy ——
  {
    gutenbergId: 1497,
    title: "The Republic (Jowett, full text)",
    alternateTitle: "Государство",
    authors: ["Plato"],
    categorySlug: "antichnaya-filosofiya-teksty",
    language: "en",
    minBytes: 300_000,
  },
  {
    gutenbergId: 13726,
    title: "Apology, Crito, and Phaedo (full text)",
    alternateTitle: "Апология, Критон, Федон",
    authors: ["Plato"],
    categorySlug: "antichnaya-filosofiya-teksty",
    language: "en",
  },
  {
    gutenbergId: 8438,
    title: "Nicomachean Ethics (full text)",
    alternateTitle: "Никомахова этика",
    authors: ["Aristotle"],
    categorySlug: "antichnaya-filosofiya-teksty",
    language: "en",
  },
  {
    gutenbergId: 6762,
    title: "Politics (Aristotle, full text)",
    alternateTitle: "Политика",
    authors: ["Aristotle"],
    categorySlug: "antichnaya-filosofiya-teksty",
    language: "en",
  },
  {
    gutenbergId: 78739,
    title: "Organon (Aristotle, full text)",
    alternateTitle: "Органон",
    authors: ["Aristotle"],
    categorySlug: "antichnaya-filosofiya-teksty",
    language: "en",
    minBytes: 300_000,
  },
  {
    gutenbergId: 2680,
    title: "Meditations (Marcus Aurelius, full text)",
    alternateTitle: "Размышления",
    authors: ["Marcus Aurelius"],
    categorySlug: "antichnaya-filosofiya-teksty",
    language: "en",
  },
  {
    gutenbergId: 45109,
    title: "The Enchiridion (full text)",
    alternateTitle: "Энхиридион",
    authors: ["Epictetus"],
    categorySlug: "antichnaya-filosofiya-teksty",
    language: "en",
  },
  {
    gutenbergId: 785,
    title: "On the Nature of Things (full text)",
    alternateTitle: "О природе вещей",
    authors: ["Lucretius"],
    categorySlug: "antichnaya-filosofiya-teksty",
    language: "en",
  },
  {
    gutenbergId: 47001,
    title: "De Officiis (full text)",
    alternateTitle: "Об обязанностях",
    authors: ["Cicero"],
    categorySlug: "antichnaya-filosofiya-teksty",
    language: "en",
  },
  {
    gutenbergId: 3794,
    title: "On Benefits (full text)",
    alternateTitle: "О благодеяниях",
    authors: ["Seneca"],
    categorySlug: "antichnaya-filosofiya-teksty",
    language: "en",
  },

  // —— Mathematics ——
  {
    gutenbergId: 21076,
    title: "The Elements of Euclid (Casey, full text)",
    alternateTitle: "Начала Евклида",
    authors: ["Euclid"],
    categorySlug: "matematika",
    language: "en",
    minBytes: 500_000,
  },
  {
    gutenbergId: 14725,
    title: "Treatise on Light (Huygens, full text)",
    alternateTitle: "Трактат о свете",
    authors: ["Christiaan Huygens"],
    categorySlug: "matematika",
    language: "en",
    minBytes: 500_000,
  },

  // —— Culturology / anthropology / civilisation ——
  {
    gutenbergId: 3623,
    title: "The Golden Bough (full text)",
    alternateTitle: "Золотая ветвь",
    authors: ["James George Frazer"],
    categorySlug: "kulturologiya",
    language: "en",
    minBytes: 500_000,
  },
  {
    gutenbergId: 70458,
    title: "Primitive Culture, Vol. 1 (full text)",
    alternateTitle: "Первобытная культура I",
    authors: ["Edward B. Tylor"],
    categorySlug: "kulturologiya",
    language: "en",
    minBytes: 400_000,
  },
  {
    gutenbergId: 70484,
    title: "Primitive Culture, Vol. 2 (full text)",
    alternateTitle: "Первобытная культура II",
    authors: ["Edward B. Tylor"],
    categorySlug: "kulturologiya",
    language: "en",
    minBytes: 400_000,
  },
  {
    gutenbergId: 2074,
    title: "The Civilisation of the Renaissance in Italy (full text)",
    alternateTitle: "Культура Возрождения в Италии",
    authors: ["Jacob Burckhardt"],
    categorySlug: "kulturologiya",
    language: "en",
  },
  {
    gutenbergId: 815,
    title: "Democracy in America, Vol. 1 (full text)",
    alternateTitle: "Демократия в Америке I",
    authors: ["Alexis de Tocqueville"],
    categorySlug: "kulturologiya",
    language: "en",
    minBytes: 300_000,
  },
  {
    gutenbergId: 24253,
    title: "Folkways (full text)",
    alternateTitle: "Народные обычаи",
    authors: ["William Graham Sumner"],
    categorySlug: "kulturologiya",
    language: "en",
    minBytes: 500_000,
  },
  {
    gutenbergId: 41360,
    title: "The Elementary Forms of the Religious Life (full text)",
    alternateTitle: "Элементарные формы религиозной жизни",
    authors: ["Émile Durkheim"],
    categorySlug: "kulturologiya",
    language: "en",
    minBytes: 400_000,
  },
  {
    gutenbergId: 71630,
    title: "The Mind of Primitive Man (full text)",
    alternateTitle: "Ум первобытного человека",
    authors: ["Franz Boas"],
    categorySlug: "kulturologiya",
    language: "en",
    minBytes: 300_000,
  },
  {
    gutenbergId: 4090,
    title: "From Ritual to Romance (full text)",
    alternateTitle: "От ритуала к роману",
    authors: ["Jessie L. Weston"],
    categorySlug: "kulturologiya",
    language: "en",
  },

  // —— Adjacent classics still used in phil/math seminars ——
  {
    gutenbergId: 1228,
    title: "On the Origin of Species (full text)",
    alternateTitle: "Происхождение видов",
    authors: ["Charles Darwin"],
    categorySlug: "estestvoznanie-klassika",
    language: "en",
    year: "1859",
    minBytes: 500_000,
  },
  {
    gutenbergId: 2300,
    title: "The Descent of Man (full text)",
    alternateTitle: "Происхождение человека",
    authors: ["Charles Darwin"],
    categorySlug: "estestvoznanie-klassika",
    language: "en",
    minBytes: 500_000,
  },
];

const ENSURE_CATEGORIES: { slug: string; name: string; description?: string; parentSlug?: string }[] = [
  {
    slug: "filosofiya-matematiki",
    name: "Философия математики",
    parentSlug: "filosofiya",
    description: "Основания, логика и философия математики.",
  },
  {
    slug: "matematika",
    name: "Математика",
    description: "Классические математические тексты в открытом доступе.",
  },
  {
    slug: "kulturologiya",
    name: "Культурология",
    description: "Культура, цивилизация, антропология культуры.",
  },
  {
    slug: "antichnaya-filosofiya-teksty",
    name: "Античные философские тексты",
    parentSlug: "filosofiya",
  },
  {
    slug: "estestvoznanie-klassika",
    name: "Классика естествознания",
  },
];

async function ensureCategory(
  def: (typeof ENSURE_CATEGORIES)[number],
  idBySlug: Map<string, string>,
): Promise<string> {
  const existing = idBySlug.get(def.slug);
  if (existing) return existing;
  const [row] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, def.slug)).limit(1);
  if (row) {
    idBySlug.set(def.slug, row.id);
    return row.id;
  }
  let parentId: string | null = null;
  if (def.parentSlug) {
    parentId = idBySlug.get(def.parentSlug) ?? null;
    if (!parentId) {
      const [p] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.slug, def.parentSlug))
        .limit(1);
      parentId = p?.id ?? null;
    }
  }
  const id = randomUUID();
  await db.insert(categories).values({
    id,
    parentId,
    slug: def.slug,
    name: def.name,
    description: def.description ?? null,
    sortOrder: 40,
  });
  idBySlug.set(def.slug, id);
  console.log(`  + category: ${def.name}`);
  return id;
}

async function tryDownload(url: string, dest: string): Promise<number | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "blablablarden-library-import/1.0 (personal; open-domain corpus)" },
      redirect: "follow",
    });
    if (!res.ok || !res.body) return null;
    const ctype = (res.headers.get("content-type") ?? "").toLowerCase();
    if (ctype.includes("text/html") || ctype.includes("xhtml")) return null;
    await fs.mkdir(path.dirname(dest), { recursive: true });
    const nodeStream = Readable.fromWeb(res.body as import("stream/web").ReadableStream);
    await pipeline(nodeStream, createWriteStream(dest));
    const stat = await fs.stat(dest);
    const fd = await fs.open(dest, "r");
    const buf = Buffer.alloc(4);
    await fd.read(buf, 0, 4, 0);
    await fd.close();
    if (buf[0] !== 0x50 || buf[1] !== 0x4b) {
      await fs.unlink(dest).catch(() => undefined);
      return null;
    }
    return stat.size;
  } catch {
    await fs.unlink(dest).catch(() => undefined);
    return null;
  }
}

/** Try mirrors; keep the largest valid EPUB that clears minBytes. */
async function downloadGutenberg(id: number, dest: string, minBytes: number): Promise<boolean> {
  const candidates = [
    `https://www.gutenberg.org/cache/epub/${id}/pg${id}-images.epub`,
    `https://www.gutenberg.org/cache/epub/${id}/pg${id}.epub`,
    `https://www.gutenberg.org/ebooks/${id}.epub.images`,
    `https://www.gutenberg.org/ebooks/${id}.epub.noimages`,
  ];
  let bestSize = 0;
  const tmp = `${dest}.part`;
  for (const url of candidates) {
    const size = await tryDownload(url, tmp);
    if (size == null) continue;
    if (size > bestSize) {
      await fs.rename(tmp, dest);
      bestSize = size;
    } else {
      await fs.unlink(tmp).catch(() => undefined);
    }
  }
  if (bestSize < minBytes) {
    if (bestSize > 0) {
      console.log(`  ! too small (${bestSize} < ${minBytes})`);
      await fs.unlink(dest).catch(() => undefined);
    } else {
      console.log(`  ! no valid EPUB mirror`);
    }
    return false;
  }
  return true;
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

  const cats = await db.select({ id: categories.id, slug: categories.slug }).from(categories);
  const catBySlug = new Map(cats.map((c) => [c.slug, c.id]));
  console.log("Ensuring categories…");
  for (const def of ENSURE_CATEGORIES) {
    await ensureCategory(def, catBySlug);
  }

  const allDocs = await db.select({ id: documents.id, title: documents.title }).from(documents);
  const byTitle = new Set(allDocs.map((d) => normalizeTitle(d.title)));

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
    const ok = await downloadGutenberg(item.gutenbergId, dest, item.minBytes ?? 50_000);
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
      description: `Полный текст Project Gutenberg (№${item.gutenbergId}). В читалке «глава N / M» — разделы EPUB, не бумажные страницы.`,
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
  console.log("Художку из прошлого прогона (Oz, Толстой и т.п.) можно удалить в /admin.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
