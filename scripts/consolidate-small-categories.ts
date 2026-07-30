/**
 * One-off cleanup: the GitHub-repo importer (scripts/import-github-repo.ts)
 * created one narrow subcategory per paper topic, so a lot of them ended up
 * holding just one or two documents. That's harmless for browsing but turns
 * the knowledge-graph views into an unreadable clump of tiny nodes. This
 * merges any leaf subcategory at/under a given max document count directly
 * into its parent and removes the now-empty subcategory, keeping only
 * subsections that actually earned their own place.
 *
 * Usage: npm run consolidate-categories -- "Статьи" 3
 */
import { eq, inArray } from "drizzle-orm";
import { db, sqlite } from "../lib/db/client";
import { categories, documents } from "../lib/db/schema";

async function main() {
  const [parentName, maxDocsArg] = process.argv.slice(2);
  const maxDocs = Number(maxDocsArg ?? 3);
  if (!parentName) {
    console.error('Использование: npm run consolidate-categories -- "Имя раздела" [макс.документов=3]');
    process.exitCode = 1;
    return;
  }

  const [parent] = await db.select().from(categories).where(eq(categories.name, parentName)).limit(1);
  if (!parent) {
    console.error(`Раздел «${parentName}» не найден.`);
    process.exitCode = 1;
    return;
  }

  const children = await db.select().from(categories).where(eq(categories.parentId, parent.id));
  let merged = 0;
  let movedDocs = 0;

  for (const child of children) {
    const grandchildren = await db.select().from(categories).where(eq(categories.parentId, child.id));
    if (grandchildren.length > 0) continue; // only flatten true leaves

    const docs = await db.select({ id: documents.id }).from(documents).where(eq(documents.categoryId, child.id));
    if (docs.length > maxDocs) continue;
    if (docs.length === 0 && grandchildren.length === 0) {
      // Empty leftover subcategory — drop it too, nothing to move.
    }

    if (docs.length > 0) {
      await db
        .update(documents)
        .set({ categoryId: parent.id })
        .where(inArray(documents.id, docs.map((d) => d.id)));
      movedDocs += docs.length;
    }
    await db.delete(categories).where(eq(categories.id, child.id));
    merged += 1;
    console.log(`  Слил «${child.name}» (${docs.length} док.) в «${parent.name}»`);
  }

  console.log(`\nГотово: ${merged} подраздел(ов) слито, ${movedDocs} документ(ов) перемещено в «${parent.name}».`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sqlite.close());
