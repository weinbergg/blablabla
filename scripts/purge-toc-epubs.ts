/**
 * Remove TOC-of-hyperlinks EPUBs (Butler-style shells and any other link stubs).
 * Prefer continuous Gutenberg TXT / Greek editions instead.
 *
 *   npm run purge:toc-epubs
 */
import { promises as fs } from "fs";
import path from "path";
import { inArray } from "drizzle-orm";
import { db } from "../lib/db/client";
import { documentAuthors, documentCategories, documentSubjects, documentTags, documents } from "../lib/db/schema";
import { assessEpubFile } from "../lib/epub-quality";

async function main() {
  const rows = await db
    .select({
      id: documents.id,
      title: documents.title,
      fileUrl: documents.fileUrl,
      fileType: documents.fileType,
    })
    .from(documents);

  const doomed: typeof rows = [];

  for (const row of rows) {
    if (row.fileType !== "EPUB") continue;
    if (!row.fileUrl?.startsWith("/uploads/")) continue;
    const disk = path.join(process.cwd(), "public", row.fileUrl.replace(/^\//, ""));
    const quality = await assessEpubFile(disk);
    if (!quality.ok) {
      doomed.push(row);
      console.log(`  ? ${row.title} — ${quality.reason}`);
    }
  }

  // Always include known Butler Homer titles even if unzip fails on the VPS
  for (const row of rows) {
    if (row.fileType !== "EPUB") continue;
    if (
      /iliad of homer/i.test(row.title) ||
      /odyssey of homer/i.test(row.title) ||
      /\(Butler/i.test(row.title)
    ) {
      if (!doomed.some((d) => d.id === row.id)) doomed.push(row);
    }
  }

  if (!doomed.length) {
    console.log("Nothing to purge — all EPUBs look like continuous prose.");
    return;
  }

  const ids = doomed.map((d) => d.id);
  console.log(`\nPurging ${ids.length} TOC-style / stub EPUB(s):`);
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

  console.log("Done. Re-run import:fullclassics — bad EPUBs will fall back to Gutenberg TXT.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
