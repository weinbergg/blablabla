/**
 * Repair the Библиотека bulk import batch:
 *  1) report missing upload files (reader 404)
 *  2) backfill authors/titles from pdfinfo when filename had no "Author - Title"
 *  3) refresh download fileName
 *  4) merge rogue "Худ.Лит" root into "Литература"
 *
 * Usage on VPS:
 *   npx tsx scripts/repair-biblioteka-import.ts
 *   npx tsx scripts/repair-biblioteka-import.ts --apply
 */
import { execFile } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { promisify } from "util";
import { eq, like, sql } from "drizzle-orm";
import { db, sqlite } from "../lib/db/client";
import { authors, categories, documentAuthors, documentCategories, documents } from "../lib/db/schema";
import { buildDisplayFileName } from "../lib/filenames";
import { parseAuthorTitle } from "../lib/bulk-import";
import { slugify } from "../lib/transliterate";
import { randomUUID } from "crypto";

const execFileAsync = promisify(execFile);
const APPLY = process.argv.includes("--apply");
const MARKER = "%Библиотека 2026-08-01%";

function splitAuthors(value: string): string[] {
  return value
    .split(/,|&|;| and /i)
    .map((s) => s.trim())
    .filter(Boolean);
}

function field(stdout: string, key: string): string | null {
  const m = stdout.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  const v = m?.[1]?.trim();
  if (!v || v === "-" || /^unknown$/i.test(v)) return null;
  return v;
}

async function pdfMeta(diskPath: string) {
  try {
    const { stdout } = await execFileAsync("pdfinfo", [diskPath], { maxBuffer: 8 * 1024 * 1024 });
    return {
      title: field(stdout, "Title"),
      authors: field(stdout, "Author") ? splitAuthors(field(stdout, "Author")!) : [],
    };
  } catch {
    return { title: null as string | null, authors: [] as string[] };
  }
}

async function getOrCreateAuthor(name: string) {
  const slug = slugify(name) || randomUUID();
  const existing = await db.select({ id: authors.id }).from(authors).where(eq(authors.slug, slug)).limit(1);
  if (existing[0]) return existing[0].id;
  const id = randomUUID();
  await db.insert(authors).values({ id, name, slug });
  return id;
}

async function main() {
  console.log(APPLY ? "APPLY mode" : "DRY-RUN (pass --apply to write)");

  const rows = await db
    .select({
      id: documents.id,
      title: documents.title,
      fileUrl: documents.fileUrl,
      fileType: documents.fileType,
      fileName: documents.fileName,
      sourceNote: documents.sourceNote,
    })
    .from(documents)
    .where(like(documents.sourceNote, MARKER));

  console.log(`Batch rows: ${rows.length}`);

  let missing = 0;
  let authorFilled = 0;
  let titleUpdated = 0;

  for (const row of rows) {
    if (!row.fileUrl?.startsWith("/uploads/")) continue;
    const disk = path.join(process.cwd(), "public", row.fileUrl);
    const exists = await fs.stat(disk).then(() => true).catch(() => false);
    if (!exists) {
      missing += 1;
      console.log(`MISSING ${row.id} ${row.title} → ${row.fileUrl}`);
      continue;
    }

    const authorLinks = await db
      .select({ authorId: documentAuthors.authorId })
      .from(documentAuthors)
      .where(eq(documentAuthors.documentId, row.id));
    if (authorLinks.length > 0) continue;
    if (row.fileType !== "PDF") continue;

    // Try recover author from original path inside sourceNote, then pdfinfo.
    const pathMatch = row.sourceNote?.match(/\[import:[^\]]+:([^\]]+)\]/);
    const originalBase = pathMatch?.[1] ? path.basename(pathMatch[1], path.extname(pathMatch[1])) : "";
    let { authorNames, title } = parseAuthorTitle(originalBase || row.title);
    const meta = await pdfMeta(disk);
    if (!authorNames.length && meta.authors.length) authorNames = meta.authors;
    if (meta.title && meta.title.length >= 3 && meta.title.length <= 200) {
      // Keep human title from import unless it's clearly a bare stub and meta is richer.
      if (authorNames.length && title === originalBase.replace(/_/g, " ").trim()) {
        title = meta.title;
      }
    }
    title = (title || row.title).trim();

    if (!authorNames.length) continue;

    console.log(`AUTHOR ${row.title} ← ${authorNames.join(", ")}`);
    if (!APPLY) {
      authorFilled += 1;
      continue;
    }

    for (const [position, name] of authorNames.entries()) {
      const authorId = await getOrCreateAuthor(name);
      await db.insert(documentAuthors).values({ documentId: row.id, authorId, position }).onConflictDoNothing();
    }
    const fileName = buildDisplayFileName(title, authorNames, `.${row.fileType.toLowerCase()}`);
    const updates: Partial<typeof documents.$inferInsert> = { fileName };
    if (title !== row.title) {
      updates.title = title;
      titleUpdated += 1;
    }
    await db.update(documents).set(updates).where(eq(documents.id, row.id));
    authorFilled += 1;
  }

  // Merge Худ.Лит → Литература
  const [lit] = await db.select().from(categories).where(eq(categories.slug, "literatura")).limit(1);
  const hudRows = await db
    .select()
    .from(categories)
    .where(sql`lower(${categories.name}) like '%худ%' or ${categories.slug} like 'hud%'`);
  for (const hud of hudRows) {
    if (!lit || hud.id === lit.id) continue;
    if (!/худ|hud/i.test(hud.name) && !/^hud/.test(hud.slug)) continue;
    const [{ value: count }] = await db
      .select({ value: sql<number>`count(*)` })
      .from(documents)
      .where(eq(documents.categoryId, hud.id));
    console.log(`MERGE category "${hud.name}" (${count} docs) → "${lit.name}"`);
    if (APPLY) {
      await db.update(documents).set({ categoryId: lit.id }).where(eq(documents.categoryId, hud.id));
      await db
        .update(documentCategories)
        .set({ categoryId: lit.id })
        .where(eq(documentCategories.categoryId, hud.id));
      await db.delete(categories).where(eq(categories.id, hud.id));
    }
  }

  console.log(`\nMissing files: ${missing}`);
  console.log(`Authors to fill / filled: ${authorFilled}`);
  console.log(`Titles updated: ${titleUpdated}`);
  if (missing > 0) {
    console.log(`
Files missing on disk — re-copy from Mac and re-run import for those only:
  rsync -avz --progress \\
    "/Users/georgij/Desktop/blabla/литература/Библиотека/" \\
    deploy@HOST:/var/www/blabla/import-staging/Библиотека/
Then fix nginx /uploads/ (see deploy/release.sh) and re-import.
`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => sqlite.close());
