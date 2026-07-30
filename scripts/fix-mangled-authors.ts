/**
 * One-off repair for a bug introduced by the second Gutenberg import batch:
 * the source catalog lists authors as "Last, First, birth-death[, role]"
 * (e.g. "Mommsen, Theodor, 1817-1903"), and that raw string was fed straight
 * into the filename. The existing filename parser treats commas as
 * author-list separators (correct for real multi-author filenames like
 * "Shen, Uspensky, Vereshchagin - Title"), so it split each single person
 * into 2-3 fake "co-authors" — one of which is literally just their
 * birth/death years.
 *
 * This script finds documents whose linked "authors" include a fragment
 * that is obviously not a name (a bare date range, "active ...", or a
 * bracketed role like "[Editor]"), reassembles the real "First Last" name
 * from the remaining fragments, and repoints document_authors at a single
 * clean author record — then deletes whatever fragment-authors are left
 * with no documents attached.
 *
 * Usage: npx tsx scripts/fix-mangled-authors.ts [--dry-run]
 */
import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { db, sqlite } from "../lib/db/client";
import { authors, documentAuthors } from "../lib/db/schema";
import { slugify } from "../lib/transliterate";

const DATE_FRAGMENT_RE =
  /^(active\s+)?(approximately\s+)?\(?\d{1,4}\s*(bce)?\s*[-–—?]\s*\d{0,4}\s*(bce)?\)?\.?$/i;
const ROLE_RE = /\[[^\]]*\]/g;

function stripRole(name: string): string {
  return name.replace(ROLE_RE, "").trim();
}

function isDateFragment(rawName: string): boolean {
  const stripped = stripRole(rawName);
  if (!stripped) return rawName.trim().length > 0 && ROLE_RE.test(rawName);
  return DATE_FRAGMENT_RE.test(stripped) || /^(active|approximately|fl\.)\b/i.test(stripped);
}

// The catalog sometimes inserts a nobiliary title/particle as its own comma
// segment between the first and last name — "Browne, Thomas, Sir, 1605-1682"
// or "Chateaubriand, François-René, vicomte de, 1768-1848". After the date
// fragment is dropped these leave 3 "non-date" segments, which would
// otherwise be mis-read as 3 separate co-authors.
const PARTICLE_DE_RE = /^(vicomte|comte|duc|marquis|baron|chevalier|prince|abbé|abbe)\s+de$/i;
const VON_RE = /^(freiherr|graf|ritter)\s+von$/i;
const PREFIX_TITLE_RE = /^(sir|lord|dame|lady)$/i;
const DROP_TITLE_RE = /^(baron|comte|duc|marquis|chevalier|bey|pasha|effendi)$/i;

/** Given [Last, First, Title] (in that catalog order), fold the title into a
 * single plausible display name instead of treating it as a 3rd co-author. */
function mergeWithTitle(last: string, first: string, title: string): string | null {
  const t = title.trim();
  if (PARTICLE_DE_RE.test(t)) return `${first} de ${last}`;
  if (VON_RE.test(t)) return `${first} von ${last}`;
  if (PREFIX_TITLE_RE.test(t)) return `${t.replace(/^\w/, (c) => c.toUpperCase())} ${first} ${last}`;
  if (DROP_TITLE_RE.test(t)) return `${first} ${last}`;
  return null;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const allAuthors = await db.select().from(authors);
  const authorById = new Map(allAuthors.map((a) => [a.id, a]));

  const links = await db
    .select()
    .from(documentAuthors)
    .orderBy(documentAuthors.documentId, documentAuthors.position);

  const byDoc = new Map<string, typeof links>();
  for (const link of links) {
    const arr = byDoc.get(link.documentId) ?? [];
    arr.push(link);
    byDoc.set(link.documentId, arr);
  }

  let fixedDocs = 0;
  const touchedAuthorIds = new Set<string>();
  const authorIdCache = new Map<string, string>();

  async function getOrCreateAuthor(name: string): Promise<string> {
    const cached = authorIdCache.get(name);
    if (cached) return cached;
    const slug = slugify(name) || randomUUID();
    const existing = await db.select({ id: authors.id }).from(authors).where(eq(authors.slug, slug)).limit(1);
    const id = existing[0]?.id ?? randomUUID();
    if (!existing[0] && !dryRun) await db.insert(authors).values({ id, name, slug });
    authorIdCache.set(name, id);
    return id;
  }

  for (const [documentId, docLinks] of byDoc) {
    const fragments = docLinks
      .map((l) => ({ link: l, author: authorById.get(l.authorId) }))
      .filter((f) => f.author);
    if (fragments.length < 2) continue;

    const hasDateFragment = fragments.some((f) => isDateFragment(f.author!.name));
    if (!hasDateFragment) continue;

    const nonDate = fragments.filter((f) => !isDateFragment(f.author!.name));
    if (nonDate.length === fragments.length) continue; // shouldn't happen given hasDateFragment
    for (const f of fragments) touchedAuthorIds.add(f.author!.id);

    let newNames: string[];
    if (nonDate.length === 0) {
      // every fragment looked date-like — nothing usable, skip rather than guess
      continue;
    } else if (nonDate.length === 1) {
      newNames = [stripRole(nonDate[0].author!.name)];
    } else if (nonDate.length === 2) {
      // catalog order is "Last, First" — swap to the conventional "First Last"
      newNames = [`${stripRole(nonDate[1].author!.name)} ${stripRole(nonDate[0].author!.name)}`.trim()];
    } else if (nonDate.length === 3) {
      const [last, first, title] = nonDate.map((f) => stripRole(f.author!.name));
      const merged = mergeWithTitle(last, first, title);
      newNames = merged ? [merged] : nonDate.map((f) => stripRole(f.author!.name));
    } else {
      // 4+ non-date fragments: likely genuine distinct co-authors with a
      // stray date attached to one of them — just drop the date fragment(s)
      // rather than guessing how to pair up names.
      newNames = nonDate.map((f) => stripRole(f.author!.name));
    }
    newNames = newNames.map((n) => n.replace(/\s+/g, " ").trim()).filter(Boolean);
    if (newNames.length === 0) continue;

    fixedDocs++;
    console.log(
      `${documentId}  [${fragments.map((f) => f.author!.name).join(" | ")}]  ->  ${newNames.join(" & ")}`,
    );

    if (dryRun) continue;

    const newIds: string[] = [];
    for (const name of newNames) newIds.push(await getOrCreateAuthor(name));

    await db.delete(documentAuthors).where(eq(documentAuthors.documentId, documentId));
    for (let i = 0; i < newIds.length; i++) {
      await db
        .insert(documentAuthors)
        .values({ documentId, authorId: newIds[i], position: i })
        .onConflictDoNothing();
    }
  }

  console.log(`\nДокументов исправлено: ${fixedDocs}`);

  if (!dryRun) {
    // Clean up fragment-authors that no longer have any documents attached.
    const remainingLinks = await db.select({ authorId: documentAuthors.authorId }).from(documentAuthors);
    const stillUsed = new Set(remainingLinks.map((l) => l.authorId));
    const orphaned = [...touchedAuthorIds].filter((id) => !stillUsed.has(id));
    if (orphaned.length) {
      await db.delete(authors).where(inArray(authors.id, orphaned));
      console.log(`Удалено осиротевших фрагментов-«авторов»: ${orphaned.length}`);
    }
  } else {
    console.log("(--dry-run, изменения не сохранены)");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sqlite.close());
