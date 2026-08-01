/**
 * Fix book titles/authors stored as latinized Russian
 * ("Zanimatelnaya astronomia", "Li S Teoria grupp preobrazovaniy … RKhD").
 *
 * Prefers Cyrillic from pdfinfo when available; otherwise reverse-transliterates.
 * Skips foreign-language catalog entries. Can also undo a bad previous pass.
 *
 *   npx tsx scripts/fix-latinized-titles.ts
 *   npx tsx scripts/fix-latinized-titles.ts --apply
 *   npx tsx scripts/fix-latinized-titles.ts --revert-mangled
 *   npx tsx scripts/fix-latinized-titles.ts --revert-mangled --apply
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
  isNonRussianLanguage,
  looksLatinizedRussian,
  looksMangledForeignCyrillic,
} from "../lib/detransliterate";
import { buildDisplayFileName } from "../lib/filenames";
import { slugify } from "../lib/transliterate";

const execFileAsync = promisify(execFile);
const APPLY = process.argv.includes("--apply");
const REVERT = process.argv.includes("--revert-mangled");
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

/** Pull original latin filename from sourceNote import marker when present. */
function filenameFromSourceNote(sourceNote: string | null): string | null {
  if (!sourceNote) return null;
  const m = sourceNote.match(/\[import:[^:\]]+:([^\]]+)\]/);
  if (!m) return null;
  const base = path.basename(m[1]).replace(/\.[^.]+$/, "");
  return base.replace(/_/g, " ").trim() || null;
}

async function main() {
  console.log(
    REVERT
      ? APPLY
        ? "REVERT-MANGLED APPLY"
        : "REVERT-MANGLED DRY-RUN"
      : APPLY
        ? "APPLY mode"
        : "DRY-RUN (pass --apply to write)",
  );

  const rows = await db
    .select({
      id: documents.id,
      title: documents.title,
      fileUrl: documents.fileUrl,
      fileType: documents.fileType,
      language: documents.language,
      sourceNote: documents.sourceNote,
      fileName: documents.fileName,
    })
    .from(documents);

  let scanned = 0;
  let titleChanged = 0;
  let authorChanged = 0;

  for (const row of rows) {
    if (scanned >= LIMIT) break;

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

    let metaTitle: string | null = null;
    let metaAuthor: string | null = null;
    if (row.fileType === "PDF" && row.fileUrl?.startsWith("/uploads/")) {
      const disk = path.join(process.cwd(), "public", row.fileUrl);
      const meta = await pdfMeta(disk);
      metaTitle = meta.title;
      metaAuthor = meta.author;
    }

    if (REVERT) {
      const mangled =
        looksMangledForeignCyrillic(row.title) ||
        (hasCyrillic(row.title) &&
          isNonRussianLanguage(row.language) &&
          metaTitle &&
          noCyrillic(metaTitle) &&
          !looksLatinizedRussian(metaTitle));

      if (!mangled) continue;
      scanned += 1;

      const fromNote = filenameFromSourceNote(row.sourceNote);
      const restore =
        (metaTitle && noCyrillic(metaTitle) && metaTitle.length >= 3 && !looksLatinizedRussian(metaTitle)
          ? metaTitle.trim()
          : null) ||
        (fromNote && noCyrillic(fromNote) && !looksLatinizedRussian(fromNote) ? fromNote : null);

      if (!restore || restore === row.title) {
        console.log(`SKIP revert (no latin source): ${row.title}`);
        continue;
      }

      titleChanged += 1;
      console.log(`REVERT  ${row.title}`);
      console.log(`     →  ${restore}`);
      if (APPLY) {
        const fileName = buildDisplayFileName(
          restore,
          authorRows.map((a) => a.name),
          `.${row.fileType.toLowerCase()}`,
        );
        // Put back a sensible non-ru language if we wrongly stamped "ru".
        let language = row.language;
        if (language === "ru" || !language) {
          language = null;
        }
        await db.update(documents).set({ title: restore, fileName, language }).where(eq(documents.id, row.id));
      }
      continue;
    }

    // Forward pass: latinized Russian → Cyrillic
    if (isNonRussianLanguage(row.language)) continue;

    const titleNeeds = noCyrillic(row.title) && (row.language === "ru" || looksLatinizedRussian(row.title));
    const authorsNeed = authorRows.filter(
      (a) => noCyrillic(a.name) && (row.language === "ru" || looksLatinizedRussian(a.name)),
    );
    if (!titleNeeds && authorsNeed.length === 0) continue;
    scanned += 1;

    let nextTitle = row.title;
    if (titleNeeds) {
      if (hasCyrillic(metaTitle) && metaTitle!.length >= 3 && metaTitle!.length <= 240) {
        nextTitle = metaTitle!.trim();
      } else {
        nextTitle = detransliterateRussian(row.title, { force: true });
        if (nextTitle && /^[а-яё]/.test(nextTitle)) {
          nextTitle = nextTitle.charAt(0).toUpperCase() + nextTitle.slice(1);
        }
      }
    }

    const nextAuthorNames: string[] = [];
    for (const author of authorRows) {
      let nextName = author.name;
      if (noCyrillic(author.name) && (looksLatinizedRussian(author.name) || row.language === "ru")) {
        if (
          authorRows.length === 1 &&
          hasCyrillic(metaAuthor) &&
          metaAuthor &&
          !metaAuthor.includes(",") &&
          metaAuthor.length <= 120
        ) {
          nextName = metaAuthor.trim();
        } else if (looksLatinizedRussian(author.name) || /^[A-Z][a-z]+\s+[A-Z]([a-z]{0,2})?(\s+[A-Z]([a-z]{0,2})?)?$/.test(author.name)) {
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
