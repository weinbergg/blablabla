/**
 * Fix book titles/authors stored as latinized Russian
 * ("Zanimatelnaya astronomia" → "Занимательная астрономия").
 *
 * Prefers Cyrillic from pdfinfo when available; otherwise reverse-transliterates.
 *
 *   npx tsx scripts/fix-latinized-titles.ts
 *   npx tsx scripts/fix-latinized-titles.ts --apply
 *   npx tsx scripts/fix-latinized-titles.ts --apply --limit=50
 */
import { execFile } from "child_process";
import path from "path";
import { promisify } from "util";
import { asc, eq } from "drizzle-orm";
import { db } from "../lib/db/client";
import { authors, documentAuthors, documents } from "../lib/db/schema";
import {
  detransliterateAuthorName,
  detransliterateRussian,
  looksLatinizedRussian,
} from "../lib/detransliterate";
import { buildDisplayFileName } from "../lib/filenames";
import { slugify } from "../lib/transliterate";

const execFileAsync = promisify(execFile);
const APPLY = process.argv.includes("--apply");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? Number(limitArg.split("=")[1]) : Infinity;

function field(stdout: string, key: string): string | null {
  const m = stdout.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  const v = m?.[1]?.trim();
  if (!v || v === "-" || /^unknown$/i.test(v)) return null;
  return v;
}

async function pdfMeta(diskPath: string) {
  try {
    const { stdout } = await execFileAsync("pdfinfo", [diskPath], { maxBuffer: 4 * 1024 * 1024 });
    return {
      title: field(stdout, "Title"),
      author: field(stdout, "Author"),
    };
  } catch {
    return { title: null as string | null, author: null as string | null };
  }
}

function hasCyrillic(value: string | null | undefined) {
  return Boolean(value && /[а-яё]/i.test(value));
}

function noCyrillic(value: string) {
  return !/[а-яё]/i.test(value);
}

async function main() {
  console.log(APPLY ? "APPLY mode" : "DRY-RUN (pass --apply to write)");

  const rows = await db
    .select({
      id: documents.id,
      title: documents.title,
      fileUrl: documents.fileUrl,
      fileType: documents.fileType,
      language: documents.language,
    })
    .from(documents);

  let scanned = 0;
  let titleChanged = 0;
  let authorChanged = 0;
  let languageSet = 0;

  for (const row of rows) {
    if (scanned >= LIMIT) break;

    const titleNeeds =
      noCyrillic(row.title) &&
      (row.language === "ru" || looksLatinizedRussian(row.title));

    const authorRows = await db
      .select({
        id: authors.id,
        name: authors.name,
        slug: authors.slug,
      })
      .from(documentAuthors)
      .innerJoin(authors, eq(authors.id, documentAuthors.authorId))
      .where(eq(documentAuthors.documentId, row.id))
      .orderBy(asc(documentAuthors.position));

    const authorsNeed = authorRows.filter((a) => noCyrillic(a.name) && looksLatinizedRussian(a.name));
    if (!titleNeeds && authorsNeed.length === 0) continue;
    scanned += 1;

    let nextTitle = row.title;
    let metaTitle: string | null = null;
    let metaAuthor: string | null = null;

    if (row.fileType === "PDF" && row.fileUrl?.startsWith("/uploads/")) {
      const disk = path.join(process.cwd(), "public", row.fileUrl);
      const meta = await pdfMeta(disk);
      metaTitle = meta.title;
      metaAuthor = meta.author;
    }

    if (titleNeeds) {
      if (hasCyrillic(metaTitle) && metaTitle!.length >= 3 && metaTitle!.length <= 240) {
        nextTitle = metaTitle!.trim();
      } else {
        nextTitle = detransliterateRussian(row.title, { force: true });
        // Filename titles are often all-lowercase — capitalize the first letter.
        if (nextTitle && /^[а-яё]/.test(nextTitle)) {
          nextTitle = nextTitle.charAt(0).toUpperCase() + nextTitle.slice(1);
        }
      }
    }

    const nextAuthorNames: string[] = [];
    for (const author of authorRows) {
      let nextName = author.name;
      if (noCyrillic(author.name) && (looksLatinizedRussian(author.name) || row.language === "ru")) {
        // Prefer first Cyrillic author from PDF when there's a single author link.
        if (
          authorRows.length === 1 &&
          hasCyrillic(metaAuthor) &&
          metaAuthor &&
          !metaAuthor.includes(",") &&
          metaAuthor.length <= 120
        ) {
          nextName = metaAuthor.trim();
        } else {
          nextName = detransliterateAuthorName(author.name);
        }
      }
      nextAuthorNames.push(nextName);

      if (nextName !== author.name) {
        authorChanged += 1;
        console.log(`AUTHOR  ${author.name}  →  ${nextName}`);
        if (APPLY) {
          const newSlug = slugify(nextName) || author.slug;
          await db.update(authors).set({ name: nextName, slug: newSlug }).where(eq(authors.id, author.id));
        }
      }
    }

    if (nextTitle !== row.title) {
      titleChanged += 1;
      console.log(`TITLE   ${row.title}`);
      console.log(`     →  ${nextTitle}`);
      if (APPLY) {
        const fileName = buildDisplayFileName(
          nextTitle,
          nextAuthorNames.length ? nextAuthorNames : authorRows.map((a) => a.name),
          `.${row.fileType.toLowerCase()}`,
        );
        await db
          .update(documents)
          .set({
            title: nextTitle,
            fileName,
            language: row.language || "ru",
          })
          .where(eq(documents.id, row.id));
      }
    } else if (APPLY && titleNeeds && !row.language) {
      await db.update(documents).set({ language: "ru" }).where(eq(documents.id, row.id));
      languageSet += 1;
    }
  }

  console.log("---");
  console.log(`Candidates touched: ${scanned}`);
  console.log(`Titles to change:   ${titleChanged}`);
  console.log(`Authors to change:  ${authorChanged}`);
  if (!APPLY) console.log("Re-run with --apply to write.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
