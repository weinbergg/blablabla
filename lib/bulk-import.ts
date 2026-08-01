/**
 * Shared engine behind every "add a lot of books at once" path in the app:
 * the admin's "Загрузка" tab (`app/api/admin/bulk-import/route.ts`) and the
 * `scripts/bulk-import.ts` CLI both call `importFromDirectory` on an already-
 * unpacked folder tree, so the folder→category matching, filename parsing,
 * dedup and language-guessing logic only exists once.
 *
 * Design choices that matter for how this behaves on messy, real-world
 * folders full of scanned books:
 * - Never overwrites or deletes anything — every run only *adds* documents
 *   (or, for a folder name that isn't yet a category, at most one new
 *   subcategory under a folder that *does* match). Safe to re-run on the
 *   same source after adding more files to it.
 * - By default a folder whose name doesn't match anything in the catalog does
 *   NOT invent a wild new top-level category — files land in
 *   `defaultCategoryId` ("Без категории"). Pass `createMissingTopLevel: true`
 *   for curated trees (e.g. literature/Библиотека) where root folders are
 *   intentional new sections.
 */
import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { promisify } from "util";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { authors, categories, documentAuthors, documents } from "@/lib/db/schema";
import { normalizeForSearch, slugify } from "@/lib/transliterate";
import { buildDisplayFileName } from "@/lib/filenames";
import { convertDjvuToPdf } from "@/lib/djvu";
import { guessLanguage } from "@/lib/languages";

const execFileAsync = promisify(execFile);

export const IMPORTABLE_EXTENSIONS = new Set([".pdf", ".epub", ".djvu", ".fb2", ".mobi", ".txt"]);
const MIN_FILE_SIZE = 12 * 1024; // below this it's almost always a stray cover image or empty scan, not a book
const SKIP_DIR_NAMES = new Set(["__macosx", ".git", "node_modules", ".ds_store", "_manifest"]);

/** Common English/Latin folder-name aliases → an existing category's slug, for
 * uploads named in a different language/script than the catalog itself. Not
 * meant to be exhaustive — anything not covered here still safely lands in
 * `defaultCategoryId` rather than being mis-filed. */
const CATEGORY_ALIASES: Record<string, string> = {
  math: "matematika",
  maths: "matematika",
  mathematics: "matematika",
  matan: "analiz",
  calculus: "analiz",
  algebra: "algebra",
  topology: "topologiya",
  philosophy: "filosofiya",
  phil: "filosofiya",
  logic: "filosofiya-yazyka",
  history: "istoriya",
  languages: "yazyki",
  language: "yazyki",
  linguistics: "yazyki",
  лингвистика: "yazyki",
  literature: "literatura",
  lit: "literatura",
  "худ.лит": "literatura",
  "худ лит": "literatura",
  "худож.лит": "literatura",
  "художественная литература": "literatura",
  religion: "religiya",
  религиоведение: "religiya",
  programming: "programmirovanie",
  antiquity: "antichnaya-filosofiya",
  ancient: "antichnaya-filosofiya",
  medieval: "srednevekovaya-filosofiya",
};

export type BulkImportOptions = {
  defaultCategoryId: string;
  sourceLabel: string;
  createdBy?: string | null;
  confidence?: "confirmed" | "low";
  /** When true, unmatched root folders become new top-level categories (and
   * remaining path segments become nested children). Use for curated drops. */
  createMissingTopLevel?: boolean;
};

export type BulkImportResult = {
  imported: number;
  skippedDuplicate: number;
  skippedUnsupported: number;
  errors: { file: string; message: string }[];
  byCategory: { categoryId: string; categoryName: string; count: number }[];
  createdCategories: string[];
};

type CategoryEntry = { id: string; parentId: string | null; name: string; slug: string };

async function walkFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIR_NAMES.has(entry.name.toLowerCase())) continue;
        await walk(full);
      } else if (entry.isFile()) {
        out.push(full);
      }
    }
  }
  await walk(root);
  return out;
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

async function pdfSampleText(filePath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("pdftotext", ["-f", "1", "-l", "3", filePath, "-"], {
      maxBuffer: 1024 * 1024 * 8,
    });
    return stdout;
  } catch {
    return "";
  }
}

function splitAuthors(value: string): string[] {
  return value
    .split(/,|&|;| and /i)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Parses "Author - Title.ext" / "Author_-_Title.ext" style filenames — the
 * convention every earlier import batch already used — falling back to the
 * bare filename as the title when no author separator is recognisable. */
export function parseAuthorTitle(fileBaseName: string): { authorNames: string[]; title: string } {
  const base = fileBaseName.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  const match = base.match(/^(.+?)\s[-–—]\s(.+)$/);
  if (match) {
    const left = match[1].trim();
    const right = match[2].trim();
    const segments = splitAuthors(left);
    // Checking each comma-separated segment's own length (rather than the
    // combined left side) is what makes multi-author filenames like
    // "Shen, Uspensky, Vereshchagin - Title" parse correctly — the combined
    // left side has plenty of words, but each individual name doesn't.
    const looksLikeAuthorList =
      segments.length > 0 &&
      segments.length <= 5 &&
      segments.every((seg) => seg.split(" ").filter(Boolean).length <= 5) &&
      !/^\d+$/.test(left);
    if (looksLikeAuthorList) {
      return { authorNames: segments, title: right || base };
    }
  }
  return { authorNames: [], title: base };
}

function normalize(value: string) {
  return normalizeForSearch(value);
}

/** Stricter than `normalize`: also drops edition/printing noise so
 * "Reinforcement Learning: An Introduction" and "Reinforcement Learning -
 * An Introduction (Second Edition)" are recognised as the same book instead
 * of silently duplicating it under a slightly different title. */
function normalizeTitleForDedup(title: string) {
  return normalize(title)
    .replace(/\b(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th)\s*edition\b/g, "")
    .replace(/\b(revised|expanded|updated|new|extended)\s*edition\b/g, "")
    .replace(/\bedition\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function loadCategoryIndex(): Promise<CategoryEntry[]> {
  return db
    .select({ id: categories.id, parentId: categories.parentId, name: categories.name, slug: categories.slug })
    .from(categories);
}

/**
 * Maps a file's folder path (relative to the import root, deepest segment
 * last) onto an existing category, trying the most specific folder first —
 * so `.../Философия/Философия математики/Гёдель/` correctly lands on the
 * "Философия математики" leaf rather than the "Философия" root just because
 * that's also somewhere in the path. See the module doc comment for why an
 * unmatched path falls back to `defaultCategoryId` instead of inventing a
 * new top-level category.
 */
async function ensureChildCategory(
  parentId: string | null,
  parentLabel: string,
  childName: string,
  index: CategoryEntry[],
  createdCategoryNames: Set<string>,
): Promise<CategoryEntry> {
  const existing = index.find(
    (c) =>
      (parentId == null ? c.parentId == null : c.parentId === parentId) &&
      normalize(c.name) === normalize(childName),
  );
  if (existing) return existing;

  const id = randomUUID();
  const slug = slugify(childName) || id;
  await db.insert(categories).values({
    id,
    parentId,
    slug,
    name: childName,
    sortOrder: 999,
  });
  const created = { id, parentId, name: childName, slug };
  index.push(created);
  createdCategoryNames.add(parentId ? `${parentLabel} → ${childName}` : childName);
  return created;
}

async function ensureCategoryChain(
  fromParentId: string | null,
  fromParentLabel: string,
  names: string[],
  index: CategoryEntry[],
  createdCategoryNames: Set<string>,
): Promise<string> {
  let parentId = fromParentId;
  let parentLabel = fromParentLabel;
  let lastId = fromParentId;
  for (const name of names) {
    const child = await ensureChildCategory(parentId, parentLabel, name, index, createdCategoryNames);
    lastId = child.id;
    parentId = child.id;
    parentLabel = child.name;
  }
  if (!lastId) throw new Error("empty category chain");
  return lastId;
}

async function resolveCategory(
  segments: string[],
  index: CategoryEntry[],
  defaultCategoryId: string,
  createdCategoryNames: Set<string>,
  createMissingTopLevel = false,
): Promise<string> {
  const clean = segments.map((s) => s.trim()).filter(Boolean);

  const findByName = (norm: string) => index.find((c) => normalize(c.name) === norm || normalize(c.slug) === norm);
  const findAlias = (norm: string) => {
    const alias = CATEGORY_ALIASES[norm];
    return alias ? findByName(normalize(alias)) : undefined;
  };
  const findFuzzy = (norm: string) => {
    if (norm.length < 4) return undefined;
    return index.find((cat) => {
      const cn = normalize(cat.name);
      return cn.length >= 4 && (cn.includes(norm) || norm.includes(cn));
    });
  };
  // A subcategory name found somewhere in the tree only counts as a match at
  // path position `i` if the segment right before it actually names that
  // subcategory's real parent. Without this check, two different branches
  // that each auto-create a same-named child (e.g. both "Философия" and
  // "Математика" getting a "Классические тексты (Gutenberg)" subfolder)
  // would collapse into whichever one was created first, since a bare
  // name→category lookup can't otherwise tell which branch a path segment
  // belongs to.
  const parentConsistent = (cat: CategoryEntry, i: number): boolean => {
    if (!cat.parentId) return true;
    if (i === 0) return false;
    const parent = index.find((c) => c.id === cat.parentId);
    if (!parent) return false;
    const prevNorm = normalize(clean[i - 1]);
    const parentNorm = normalize(parent.name);
    return (
      parentNorm === prevNorm ||
      normalize(parent.slug) === prevNorm ||
      normalize(CATEGORY_ALIASES[prevNorm] ?? "") === parentNorm
    );
  };

  // Walk from the most specific (deepest) folder up to the root, matching
  // each against the catalog. Once an ancestor matches, create the full
  // remaining path under it as nested subcategories (not just one level).
  for (let i = clean.length - 1; i >= 0; i--) {
    const norm = normalize(clean[i]);
    if (!norm) continue;
    const candidate = findByName(norm) ?? findAlias(norm) ?? findFuzzy(norm);
    if (!candidate || !parentConsistent(candidate, i)) continue;

    if (i < clean.length - 1) {
      return ensureCategoryChain(
        candidate.id,
        candidate.name,
        clean.slice(i + 1),
        index,
        createdCategoryNames,
      );
    }
    return candidate.id;
  }

  if (createMissingTopLevel && clean.length > 0) {
    return ensureCategoryChain(null, "", clean, index, createdCategoryNames);
  }

  return defaultCategoryId;
}

async function storeFileFromPath(sourcePath: string, extension: string) {
  const isDjvu = extension === ".djvu";
  const storedExt = isDjvu ? ".pdf" : extension;
  const storedId = randomUUID();
  const uploadDir = path.join(process.cwd(), "public", "uploads");
  await fs.mkdir(uploadDir, { recursive: true });
  const finalPath = path.join(uploadDir, `${storedId}${storedExt}`);

  if (isDjvu) {
    await convertDjvuToPdf(sourcePath, finalPath);
  } else {
    await fs.copyFile(sourcePath, finalPath);
  }

  return {
    fileUrl: `/uploads/${storedId}${storedExt}`,
    fileType: storedExt.slice(1).toUpperCase(),
    originalFormat: isDjvu ? "DJVU" : null,
    storedPath: finalPath,
  };
}

async function readTextSample(filePath: string, extension: string): Promise<string> {
  if (extension === ".pdf") return pdfSampleText(filePath);
  if (extension === ".txt" || extension === ".fb2") {
    try {
      const buf = await fs.readFile(filePath, "utf8");
      return buf.slice(0, 6000);
    } catch {
      return "";
    }
  }
  return "";
}

/** EPUB is a zip with an OPF manifest that (almost always) declares
 * `<dc:language>`. Reading that beats guessing from a text sample: the
 * opening pages of a Project Gutenberg file are always the same English
 * license boilerplate regardless of what language the book itself is in. */
async function epubLanguage(filePath: string): Promise<string | null> {
  try {
    const { stdout: container } = await execFileAsync("unzip", ["-p", filePath, "META-INF/container.xml"], {
      maxBuffer: 1024 * 1024,
    });
    const opfPath = container.match(/full-path="([^"]+)"/)?.[1];
    if (!opfPath) return null;
    const { stdout: opf } = await execFileAsync("unzip", ["-p", filePath, opfPath], {
      maxBuffer: 1024 * 1024 * 4,
    });
    const raw = opf.match(/<dc:language[^>]*>([^<]+)<\/dc:language>/i)?.[1]?.trim().toLowerCase();
    if (!raw) return null;
    return raw.split(/[-_]/)[0].slice(0, 3) || null;
  } catch {
    return null;
  }
}

export async function importFromDirectory(rootDir: string, options: BulkImportOptions): Promise<BulkImportResult> {
  const files = await walkFiles(rootDir);
  const categoryIndex = await loadCategoryIndex();
  const categoryNameById = new Map(categoryIndex.map((c) => [c.id, c.name]));
  const createdCategoryNames = new Set<string>();

  const existingDocs = await db.select({ id: documents.id, title: documents.title, sourceNote: documents.sourceNote }).from(documents);
  const existingTitles = new Set(existingDocs.map((d) => normalizeTitleForDedup(d.title)));
  const existingSourceNotes = new Set(existingDocs.map((d) => d.sourceNote).filter(Boolean) as string[]);

  const authorIdCache = new Map<string, string>();
  async function getOrCreateAuthor(name: string) {
    const cached = authorIdCache.get(name);
    if (cached) return cached;
    const slug = slugify(name) || randomUUID();
    const existing = await db.select({ id: authors.id }).from(authors).where(eq(authors.slug, slug)).limit(1);
    const id = existing[0]?.id ?? randomUUID();
    if (!existing[0]) await db.insert(authors).values({ id, name, slug });
    authorIdCache.set(name, id);
    return id;
  }

  const result: BulkImportResult = {
    imported: 0,
    skippedDuplicate: 0,
    skippedUnsupported: 0,
    errors: [],
    byCategory: [],
    createdCategories: [],
  };
  const perCategoryCount = new Map<string, number>();

  for (const filePath of files) {
    const extension = path.extname(filePath).toLowerCase();
    const relPath = path.relative(rootDir, filePath);
    const stat = await fs.stat(filePath).catch(() => null);

    if (!IMPORTABLE_EXTENSIONS.has(extension)) {
      result.skippedUnsupported += 1;
      continue;
    }
    if (!stat || stat.size < MIN_FILE_SIZE) {
      result.skippedUnsupported += 1;
      continue;
    }

    const sourceMarker = `[import:${options.sourceLabel}:${relPath}]`;
    if (existingSourceNotes.has(sourceMarker) || [...existingSourceNotes].some((n) => n.includes(sourceMarker))) {
      result.skippedDuplicate += 1;
      continue;
    }

    try {
      const baseName = path.basename(filePath, extension);
      const { authorNames, title } = parseAuthorTitle(baseName);
      const normTitle = normalizeTitleForDedup(title);
      if (existingTitles.has(normTitle)) {
        result.skippedDuplicate += 1;
        continue;
      }

      const segments = path.dirname(relPath).split(path.sep).filter((s) => s && s !== ".");
      const categoryId = await resolveCategory(
        segments,
        categoryIndex,
        options.defaultCategoryId,
        createdCategoryNames,
        Boolean(options.createMissingTopLevel),
      );

      let language = extension === ".epub" ? await epubLanguage(filePath) : null;
      if (!language) {
        const sample = await readTextSample(filePath, extension);
        language = sample.trim() ? guessLanguage(sample) : null;
      }

      const { fileUrl, fileType, originalFormat, storedPath } = await storeFileFromPath(filePath, extension);
      const pages = fileType === "PDF" ? await pdfPageCount(storedPath) : null;
      const fileName = buildDisplayFileName(title, authorNames, `.${fileType.toLowerCase()}`);

      const documentId = randomUUID();
      await db.insert(documents).values({
        id: documentId,
        title,
        categoryId,
        fileUrl,
        fileName,
        fileType,
        originalFormat,
        pages,
        language,
        confidence: options.confidence ?? "low",
        sourceNote: `Массовая загрузка (${options.sourceLabel}) ${sourceMarker}`,
        createdBy: options.createdBy ?? null,
      });

      for (const [position, name] of authorNames.entries()) {
        const authorId = await getOrCreateAuthor(name);
        await db.insert(documentAuthors).values({ documentId, authorId, position }).onConflictDoNothing();
      }

      existingTitles.add(normTitle);
      existingSourceNotes.add(sourceMarker);
      result.imported += 1;
      perCategoryCount.set(categoryId, (perCategoryCount.get(categoryId) ?? 0) + 1);
    } catch (error) {
      result.errors.push({ file: relPath, message: error instanceof Error ? error.message : String(error) });
    }
  }

  result.createdCategories = Array.from(createdCategoryNames);
  // categoryNameById was snapshotted before the run, so a category
  // auto-created mid-run (see resolveCategory) won't be in it yet — fall
  // back to the live, mutated `categoryIndex` before giving up and calling
  // it "Без категории".
  const liveNameById = new Map(categoryIndex.map((c) => [c.id, c.name]));
  result.byCategory = Array.from(perCategoryCount.entries())
    .map(([categoryId, count]) => ({
      categoryId,
      categoryName: categoryNameById.get(categoryId) ?? liveNameById.get(categoryId) ?? "Без категории",
      count,
    }))
    .sort((a, b) => b.count - a.count);

  return result;
}

const ARCHIVE_EXTRACTORS: { test: RegExp; run: (archivePath: string, destDir: string) => Promise<void> }[] = [
  {
    test: /\.zip$/i,
    run: async (archivePath, destDir) => {
      await execFileAsync("unzip", ["-o", "-q", archivePath, "-d", destDir], { maxBuffer: 1024 * 1024 * 32 });
    },
  },
  {
    test: /\.(tar\.gz|tgz)$/i,
    run: async (archivePath, destDir) => {
      await execFileAsync("tar", ["-xzf", archivePath, "-C", destDir], { maxBuffer: 1024 * 1024 * 32 });
    },
  },
  {
    test: /\.tar$/i,
    run: async (archivePath, destDir) => {
      await execFileAsync("tar", ["-xf", archivePath, "-C", destDir], { maxBuffer: 1024 * 1024 * 32 });
    },
  },
  {
    test: /\.7z$/i,
    run: async (archivePath, destDir) => {
      await execFileAsync("7z", ["x", `-o${destDir}`, "-y", archivePath], { maxBuffer: 1024 * 1024 * 32 });
    },
  },
  {
    test: /\.rar$/i,
    run: async (archivePath, destDir) => {
      await execFileAsync("unrar", ["x", "-y", archivePath, destDir], { maxBuffer: 1024 * 1024 * 32 });
    },
  },
];

export function isArchiveFile(fileName: string): boolean {
  return ARCHIVE_EXTRACTORS.some((e) => e.test.test(fileName));
}

/** Extracts a single archive file into `destDir`, picking the right CLI tool
 * by extension. Throws if no matching extractor is available/installed. */
export async function extractArchive(archivePath: string, destDir: string): Promise<void> {
  const extractor = ARCHIVE_EXTRACTORS.find((e) => e.test.test(archivePath));
  if (!extractor) throw new Error(`Неизвестный формат архива: ${path.basename(archivePath)}`);
  await fs.mkdir(destDir, { recursive: true });
  await extractor.run(archivePath, destDir);
}

export async function ensureUncategorizedCategory(): Promise<string> {
  const slug = "bez-kategorii";
  const existing = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, slug)).limit(1);
  if (existing[0]) return existing[0].id;
  const id = randomUUID();
  await db.insert(categories).values({
    id,
    parentId: null,
    slug,
    name: "Без категории",
    description: "Автоматически загруженные материалы, для которых не удалось однозначно определить раздел — переразнесите их вручную.",
    sortOrder: 9999,
  });
  return id;
}
