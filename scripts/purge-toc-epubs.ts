/**
 * Soft-remove known bad "TOC-of-hyperlinks" Gutenberg EPUBs (e.g. Butler Iliad)
 * that open as a page of blue links rather than continuous prose. Files on disk
 * are deleted; DB rows are removed. Safe to re-run.
 *
 *   npx tsx scripts/purge-toc-epubs.ts
 */
import { promises as fs } from "fs";
import path from "path";
import { eq, inArray, like, or } from "drizzle-orm";
import { db } from "../lib/db/client";
import { documentAuthors, documentCategories, documentSubjects, documentTags, documents } from "../lib/db/schema";

const TITLE_PATTERNS = [
  "The Iliad of Homer",
  "The Odyssey of Homer",
  "The Iliad (Butler",
  "The Odyssey (Butler",
];

async function main() {
  const rows = await db
    .select({ id: documents.id, title: documents.title, fileUrl: documents.fileUrl, fileType: documents.fileType })
    .from(documents)
    .where(
      or(
        ...TITLE_PATTERNS.map((t) => like(documents.title, `%${t}%`)),
        eq(documents.title, "The Iliad of Homer"),
        eq(documents.title, "The Odyssey of Homer"),
      ),
    );

  // Prefer English Butler EPUBs; keep Greek TXT.
  const doomed = rows.filter(
    (r) =>
      r.fileType === "EPUB" &&
      (/iliad of homer/i.test(r.title) || /odyssey of homer/i.test(r.title) || /butler/i.test(r.title)),
  );

  if (!doomed.length) {
    console.log("Nothing to purge.");
    return;
  }

  const ids = doomed.map((d) => d.id);
  console.log(`Purging ${ids.length} TOC-style EPUB(s):`);
  for (const d of doomed) console.log(`  - ${d.title}`);

  await db.delete(documentAuthors).where(inArray(documentAuthors.documentId, ids));
  await db.delete(documentCategories).where(inArray(documentCategories.documentId, ids));
  await db.delete(documentSubjects).where(inArray(documentSubjects.documentId, ids));
  await db.delete(documentTags).where(inArray(documentTags.documentId, ids));
  await db.delete(documents).where(inArray(documents.id, ids));

  for (const d of doomed) {
    if (!d.fileUrl?.startsWith("/uploads/")) continue;
    const disk = path.join(process.cwd(), "public", d.fileUrl.replace(/^\//, ""));
    await fs.unlink(disk).catch(() => undefined);
  }

  console.log("Done. Prefer the Greek TXT editions + reader TOC for continuous reading.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
