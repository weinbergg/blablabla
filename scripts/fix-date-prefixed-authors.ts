/**
 * Companion to fix-mangled-authors.ts: catches a second variant of the same
 * underlying problem where the catalog's "name, birth-death[, role]" string
 * ended up as a *single* author record instead of being comma-split — e.g.
 * "432 BCE-351 BCE Xenophon" or "1871-1911 [Compiler] Hyatt" — rather than
 * several linked fragment-authors. Strips the leading date range and/or
 * bracketed role and keeps the trailing name, merging into an existing
 * clean author record when one already exists.
 *
 * Usage: npx tsx scripts/fix-date-prefixed-authors.ts [--dry-run]
 */
import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { db, sqlite } from "../lib/db/client";
import { authors, documentAuthors } from "../lib/db/schema";
import { slugify } from "../lib/transliterate";

const LEADING_DATE_RE = /^\d{1,4}\s*(bce)?\s*[-–—]\s*\d{1,4}\s*(bce)?\s+/i;
const LEADING_ROLE_RE = /^\[[^\]]*\]\s*/;

function cleanName(raw: string): string {
  let name = raw.trim();
  // order can be "date role name" or "role date name" — strip either, twice.
  for (let i = 0; i < 2; i++) {
    name = name.replace(LEADING_DATE_RE, "").replace(LEADING_ROLE_RE, "").trim();
  }
  return name;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const all = await db.select().from(authors);

  const byCleanName = new Map<string, string[]>(); // cleanName -> [authorIds]
  for (const a of all) {
    const cleaned = cleanName(a.name);
    if (cleaned === a.name || !cleaned) continue; // nothing to fix, or would go empty
    const list = byCleanName.get(cleaned) ?? [];
    list.push(a.id);
    byCleanName.set(cleaned, list);
  }

  console.log(`Найдено записей для очистки: ${[...byCleanName.values()].flat().length}`);

  if (!dryRun) {
    for (const [cleaned, ids] of byCleanName) {
      const slug = slugify(cleaned) || randomUUID();
      const existing = await db.select({ id: authors.id }).from(authors).where(eq(authors.slug, slug)).limit(1);
      const targetId = existing[0]?.id ?? ids[0];
      if (!existing[0]) {
        await db.update(authors).set({ name: cleaned, slug }).where(eq(authors.id, targetId));
      }
      const staleIds = ids.filter((id) => id !== targetId);
      if (staleIds.length) {
        const links = await db.select().from(documentAuthors).where(inArray(documentAuthors.authorId, staleIds));
        await db.delete(documentAuthors).where(inArray(documentAuthors.authorId, staleIds));
        for (const link of links) {
          await db
            .insert(documentAuthors)
            .values({ documentId: link.documentId, authorId: targetId, position: link.position })
            .onConflictDoNothing();
        }
        await db.delete(authors).where(inArray(authors.id, staleIds));
      }
      console.log(`-> ${cleaned}  (объединено записей: ${ids.length})`);
    }
  } else {
    for (const [cleaned, ids] of byCleanName) {
      const originals = ids.map((id) => all.find((a) => a.id === id)?.name);
      console.log(`[${originals.join(" | ")}]  ->  ${cleaned}`);
    }
    console.log("\n(--dry-run, изменения не сохранены)");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sqlite.close());
