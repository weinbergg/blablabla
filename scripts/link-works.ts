/**
 * Link editions/translations into Work records and disambiguate Gutenberg folders.
 * Does not merge documents, does not touch files.
 *
 *   npx tsx scripts/link-works.ts
 *   npx tsx scripts/link-works.ts --dry-run
 */
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db, sqlite } from "../lib/db/client";
import { authors, categories, documentAuthors, documents, workDocuments, works } from "../lib/db/schema";
import { assignWorkRoles, coreTitle, matchKnownWork } from "../lib/work-keys";

type Member = {
  id: string;
  title: string;
  alternateTitle: string | null;
  language: string | null;
  authorId: string;
  authorName: string;
  authorSlug: string;
};

async function renameGutenbergBuckets(dryRun: boolean) {
  const rows = await db.select().from(categories);
  const byId = new Map(rows.map((row) => [row.id, row]));
  let renamed = 0;
  for (const cat of rows) {
    if (cat.name !== "Классические тексты (Gutenberg)") continue;
    const parent = cat.parentId ? byId.get(cat.parentId) : null;
    if (!parent) continue;
    const next = `Классические тексты · ${parent.name} (Gutenberg)`;
    console.log(`category ${cat.id.slice(0, 8)} → ${next}`);
    if (!dryRun) {
      await db.update(categories).set({ name: next }).where(eq(categories.id, cat.id));
    }
    renamed += 1;
  }
  return renamed;
}

async function loadMembers(): Promise<Member[]> {
  const docs = await db
    .select({
      id: documents.id,
      title: documents.title,
      alternateTitle: documents.alternateTitle,
      language: documents.language,
    })
    .from(documents);
  const links = await db
    .select({
      documentId: documentAuthors.documentId,
      authorId: authors.id,
      authorName: authors.name,
      authorSlug: authors.slug,
      position: documentAuthors.position,
    })
    .from(documentAuthors)
    .innerJoin(authors, eq(documentAuthors.authorId, authors.id));
  const primary = new Map<string, { authorId: string; authorName: string; authorSlug: string; position: number }>();
  for (const link of links) {
    const prev = primary.get(link.documentId);
    if (!prev || link.position < prev.position) {
      primary.set(link.documentId, {
        authorId: link.authorId,
        authorName: link.authorName,
        authorSlug: link.authorSlug,
        position: link.position,
      });
    }
  }
  return docs.flatMap((doc) => {
    const author = primary.get(doc.id);
    if (!author) return [];
    return [{ ...doc, ...author }];
  });
}

function cluster(members: Member[]) {
  const groups = new Map<string, { key: string; title: string; authorId: string; authorSlug: string; members: Member[] }>();
  for (const member of members) {
    const blob = `${member.title} ${member.alternateTitle ?? ""}`;
    const known = matchKnownWork(blob, member.authorSlug);
    const core = coreTitle(member.title, member.alternateTitle, member.authorName);
    if (!known && core.length < 5) continue;
    const workSlug = known?.slug ?? `core-${core.replace(/\s+/g, "-").slice(0, 48)}`;
    const key = `${member.authorSlug}--${workSlug}`;
    const group = groups.get(key);
    if (group) group.members.push(member);
    else {
      groups.set(key, {
        key,
        title: known?.title ?? member.title,
        authorId: member.authorId,
        authorSlug: member.authorSlug,
        members: [member],
      });
    }
  }
  return [...groups.values()].filter((group) => group.members.length >= 2);
}

async function relinkWorks(dryRun: boolean) {
  const members = await loadMembers();
  const groups = cluster(members);

  const manualLinks = await db
    .select({ documentId: workDocuments.documentId })
    .from(workDocuments)
    .innerJoin(works, eq(workDocuments.workId, works.id))
    .where(eq(works.source, "manual"));
  const locked = new Set(manualLinks.map((row) => row.documentId));

  if (!dryRun) {
    await db.delete(works).where(eq(works.source, "auto"));
  }

  let linked = 0;
  for (const group of groups) {
    const usable = group.members.filter((m) => !locked.has(m.id));
    if (usable.length < 2) {
      console.log(`skip ${group.key} (manual lock or size ${usable.length})`);
      continue;
    }
    const roles = assignWorkRoles(usable);
    const title =
      usable.find((m) => m.language === "grc")?.alternateTitle ||
      group.title;
    console.log(`${group.key} ×${usable.length} «${title}»`);
    for (const member of usable) {
      console.log(`  ${roles.get(member.id)}  ${member.language ?? "?"}  ${member.title}`);
    }
    if (dryRun) {
      linked += usable.length;
      continue;
    }
    const id = randomUUID();
    await db.insert(works).values({
      id,
      slug: group.key,
      title,
      authorId: group.authorId,
      source: "auto",
    });
    await db.insert(workDocuments).values(
      usable.map((member) => ({
        workId: id,
        documentId: member.id,
        role: roles.get(member.id) ?? "edition",
      })),
    );
    linked += usable.length;
  }
  return { groups: groups.length, linked };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const renamed = await renameGutenbergBuckets(dryRun);
  const { groups, linked } = await relinkWorks(dryRun);
  console.log(`\n${dryRun ? "dry-run" : "done"}: gutenberg-renamed=${renamed} work-groups=${groups} documents-linked=${linked}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sqlite.close());
