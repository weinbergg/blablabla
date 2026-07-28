/**
 * Additive import of a book/paper collection from a public GitHub repo
 * (currently: dimitarpg13/information_theory_and_statistical_mechanics).
 * Does NOT touch the existing catalog — only adds a new top-level section.
 *
 * Usage: npm run import:repo
 */
import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { promisify } from "util";
import { eq, and, isNull, sql } from "drizzle-orm";
import { db } from "../lib/db/client";
import { categories, documentAuthors, documents } from "../lib/db/schema";
import { slugify } from "../lib/transliterate";
import { buildDisplayFileName } from "../lib/filenames";
import { getOrCreateAuthorsByNames } from "../lib/db/authors";

const execFileAsync = promisify(execFile);

const OWNER = "dimitarpg13";
const REPO = "information_theory_and_statistical_mechanics";
const BRANCH = "main";
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

const TOP_CATEGORY = {
  slug: "teoriya-informatsii",
  name: "Теория информации и статистическая механика",
  description:
    "Книги и статьи о теории информации, статистической механике и её связях с обучением и генеративными моделями.",
};

const ARTICLE_FOLDER_NAMES: Record<string, string> = {
  "(root)": "Общие статьи",
  Ising_model: "Модель Изинга",
  SETOL: "SETOL: теория глубокого обучения",
  brownian_motion: "Броуновское движение",
  conformal_prediction: "Конформное предсказание",
  deep_research: "AI-агенты и deep research",
  diffusion_transformer: "Диффузионные трансформеры",
  double_descent: "Double descent",
  epiplexity: "Эпиплексия",
  fisher_information_and_information_geometry: "Информационная геометрия Фишера",
  generative_models: "Генеративные модели и диффузия",
  geometric_contact_flows: "Контактная геометрия",
  information_geometry: "Информационная геометрия",
  kolmogorov_complexity: "Колмогоровская сложность",
  large_language_models: "Языковые модели",
  monte_carlo: "Метод Монте-Карло",
  non_equilibrium_statistical_mechanics: "Неравновесная статистическая механика",
  "non_equilibrium_statistical_mechanics/lecture_notes_klaus_schulten":
    "Лекции Клауса Шультена",
  percolation: "Перколация",
  pysics_emulation_via_gen_models: "Моделирование физики генеративными сетями",
  seq2seq: "Seq2seq и исправление опечаток",
  statistical_mechanics_of_neural_nets: "Статистическая механика нейросетей",
  symmetries_in_thermodynamics: "Симметрии в термодинамике",
  test_time_adaptation_via_diffusion: "Test-time адаптация через диффузию",
  thermodynamics_of_computation: "Термодинамика вычислений",
  variational_autoencoders: "Вариационные автоэнкодеры",
  variational_inference: "Вариационный вывод",
};

type TreeEntry = { path: string; type: string; size?: number };

async function fetchTree(): Promise<TreeEntry[]> {
  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/git/trees/${BRANCH}?recursive=1`,
  );
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  const data = (await res.json()) as { tree: TreeEntry[]; truncated: boolean };
  if (data.truncated) throw new Error("Tree response truncated — repo too large for one call.");
  return data.tree.filter((entry) => entry.type === "blob");
}

async function downloadFile(repoPath: string): Promise<Buffer> {
  const mediaUrl = `https://media.githubusercontent.com/media/${OWNER}/${REPO}/${BRANCH}/${encodeURI(repoPath)}`;
  const rawUrl = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${encodeURI(repoPath)}`;

  for (const url of [mediaUrl, rawUrl]) {
    const res = await fetch(url);
    if (!res.ok) continue;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.slice(0, 4).toString("latin1") === "%PDF") return buf;
  }
  throw new Error(`Could not download a valid PDF for ${repoPath}`);
}

async function pdfPageCount(filePath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("pdfinfo", [filePath], {
      maxBuffer: 1024 * 1024 * 8,
      timeout: 15000,
    });
    const match = stdout.match(/^Pages:\s+(\d+)/m);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

/**
 * Filenames in this repo mix conventions ("Song_2023", "Title-Case-Author-Year",
 * "camelCaseNoSpaces"), so we don't try to reliably split off an author name —
 * that heuristic destroyed real title words too often. We only pull a trailing
 * 4-digit year (if unambiguous) and otherwise just turn separators into spaces.
 */
function cleanTitle(fileBase: string) {
  const withoutExt = fileBase.replace(/\.pdf$/i, "");
  const yearMatch = withoutExt.match(/^(.*?)[_\s-]*((?:19|20)\d{2})(?:ver\d+)?$/);
  const rest = yearMatch ? yearMatch[1] : withoutExt;
  const year = yearMatch ? yearMatch[2] : "";

  const title = rest
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { title: title || withoutExt, author: "", year };
}

async function getOrCreateCategory(
  parentId: string | null,
  slug: string,
  name: string,
  description?: string,
) {
  const existing = await db
    .select()
    .from(categories)
    .where(
      parentId
        ? and(eq(categories.parentId, parentId), eq(categories.slug, slug))
        : and(isNull(categories.parentId), eq(categories.slug, slug)),
    )
    .limit(1);
  if (existing[0]) return existing[0].id;

  const id = randomUUID();
  await db.insert(categories).values({
    id,
    parentId,
    slug,
    name,
    description: description ?? null,
    sortOrder: 999,
  });
  return id;
}

async function alreadyImported(repoPath: string) {
  const marker = `(${repoPath}).`;
  const existing = await db
    .select({ id: documents.id })
    .from(documents)
    .where(sql`${documents.sourceNote} like ${"%" + marker}`)
    .limit(1);
  return Boolean(existing[0]);
}

async function importOne(repoPath: string, categoryId: string) {
  if (await alreadyImported(repoPath)) {
    console.log(`  [пропущено, уже есть] ${repoPath}`);
    return;
  }

  const fileBase = path.basename(repoPath);
  const { title, author, year } = cleanTitle(fileBase);

  const buffer = await downloadFile(repoPath);
  const storedId = randomUUID();
  const storedPath = path.join(UPLOAD_DIR, `${storedId}.pdf`);
  await fs.writeFile(storedPath, buffer);
  const pages = await pdfPageCount(storedPath);

  const authorNames = author ? [author] : [];
  const fileName = buildDisplayFileName(title, authorNames, ".pdf");
  const documentId = randomUUID();

  await db.insert(documents).values({
    id: documentId,
    title,
    year: year || null,
    categoryId,
    fileUrl: `/uploads/${storedId}.pdf`,
    fileName,
    fileType: "PDF",
    pages,
    confidence: "low",
    sourceNote: `Импортировано из github.com/${OWNER}/${REPO} (${repoPath}). Название и автор определены автоматически — стоит проверить.`,
  });

  if (authorNames.length) {
    const authorIds = await getOrCreateAuthorsByNames(authorNames);
    for (const [position, authorId] of authorIds.entries()) {
      await db
        .insert(documentAuthors)
        .values({ documentId, authorId, position })
        .onConflictDoNothing();
    }
  }
}

async function main() {
  console.log(`Читаю дерево репозитория ${OWNER}/${REPO}...`);
  const tree = await fetchTree();
  const books = tree.filter((e) => e.path.startsWith("literature/books/"));
  const articles = tree.filter((e) => e.path.startsWith("literature/articles/"));
  console.log(`Найдено: ${books.length} книг, ${articles.length} статей.`);

  const limit = process.env.IMPORT_LIMIT ? Number(process.env.IMPORT_LIMIT) : null;
  const booksToImport = limit ? books.slice(0, limit) : books;
  const articlesToImport = limit ? articles.slice(0, Math.max(0, limit - booksToImport.length)) : articles;

  const topId = await getOrCreateCategory(
    null,
    TOP_CATEGORY.slug,
    TOP_CATEGORY.name,
    TOP_CATEGORY.description,
  );
  const booksId = await getOrCreateCategory(topId, "knigi", "Книги");
  const articlesTopId = await getOrCreateCategory(topId, "statyi", "Статьи");

  let imported = 0;
  const failed: string[] = [];

  for (const entry of booksToImport) {
    try {
      await importOne(entry.path, booksId);
      imported += 1;
      console.log(`  [книга] ${entry.path}`);
    } catch (error) {
      failed.push(entry.path);
      console.warn(`  ! не удалось импортировать ${entry.path}:`, (error as Error).message);
    }
  }

  const articleCategoryCache = new Map<string, string>();
  for (const entry of articlesToImport) {
    const rest = entry.path.slice("literature/articles/".length);
    const parts = rest.split("/");
    const folderKey = parts.length > 1 ? parts.slice(0, -1).join("/") : "(root)";

    let categoryId = articleCategoryCache.get(folderKey);
    if (!categoryId) {
      if (folderKey.includes("/")) {
        const [parentKey, childKey] = folderKey.split("/");
        const parentName = ARTICLE_FOLDER_NAMES[parentKey] ?? parentKey;
        const parentCategoryId =
          articleCategoryCache.get(parentKey) ??
          (await getOrCreateCategory(articlesTopId, slugify(parentKey), parentName));
        articleCategoryCache.set(parentKey, parentCategoryId);
        const childName = ARTICLE_FOLDER_NAMES[folderKey] ?? childKey;
        categoryId = await getOrCreateCategory(parentCategoryId, slugify(childKey), childName);
      } else {
        const name = ARTICLE_FOLDER_NAMES[folderKey] ?? folderKey;
        categoryId = await getOrCreateCategory(
          articlesTopId,
          folderKey === "(root)" ? "obshchie" : slugify(folderKey),
          name,
        );
      }
      articleCategoryCache.set(folderKey, categoryId);
    }

    try {
      await importOne(entry.path, categoryId);
      imported += 1;
      console.log(`  [статья] ${entry.path}`);
    } catch (error) {
      failed.push(entry.path);
      console.warn(`  ! не удалось импортировать ${entry.path}:`, (error as Error).message);
    }
  }

  console.log("\nГотово.");
  console.log(`  Импортировано: ${imported}`);
  if (failed.length) {
    console.log(`  Не удалось (${failed.length}):`);
    failed.forEach((f) => console.log(`    - ${f}`));
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
