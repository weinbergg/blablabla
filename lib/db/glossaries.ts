import { randomUUID } from "crypto";
import { desc, eq, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { glossaries, glossaryEntries, users } from "@/lib/db/schema";
import { normalizeForSearch } from "@/lib/transliterate";

export type GlossaryVisibility = "private" | "public";

export function normalizeGlossaryTerm(term: string): string {
  return normalizeForSearch(term).replace(/\s+/g, " ").trim();
}

export async function listGlossariesForUser(userId: string | null) {
  const rows = await db
    .select({
      id: glossaries.id,
      title: glossaries.title,
      description: glossaries.description,
      language: glossaries.language,
      visibility: glossaries.visibility,
      ownerId: glossaries.ownerId,
      ownerName: users.name,
      updatedAt: glossaries.updatedAt,
      createdAt: glossaries.createdAt,
      entryCount: sql<number>`(select count(*) from glossary_entries where glossary_id = ${glossaries.id})`,
    })
    .from(glossaries)
    .innerJoin(users, eq(users.id, glossaries.ownerId))
    .where(
      userId
        ? or(eq(glossaries.visibility, "public"), eq(glossaries.ownerId, userId))
        : eq(glossaries.visibility, "public"),
    )
    .orderBy(desc(glossaries.updatedAt));

  return rows.map((r) => ({
    ...r,
    entryCount: Number(r.entryCount) || 0,
    mine: Boolean(userId && r.ownerId === userId),
  }));
}

export async function getGlossary(id: string, viewerId: string | null) {
  const [row] = await db
    .select({
      id: glossaries.id,
      title: glossaries.title,
      description: glossaries.description,
      language: glossaries.language,
      visibility: glossaries.visibility,
      ownerId: glossaries.ownerId,
      ownerName: users.name,
      updatedAt: glossaries.updatedAt,
      createdAt: glossaries.createdAt,
    })
    .from(glossaries)
    .innerJoin(users, eq(users.id, glossaries.ownerId))
    .where(eq(glossaries.id, id))
    .limit(1);

  if (!row) return null;
  if (row.visibility === "private" && row.ownerId !== viewerId) return null;

  const entries = await db
    .select()
    .from(glossaryEntries)
    .where(eq(glossaryEntries.glossaryId, id))
    .orderBy(glossaryEntries.term);

  return { ...row, entries };
}

export async function createGlossary(input: {
  ownerId: string;
  title: string;
  description?: string | null;
  language?: string | null;
  visibility?: GlossaryVisibility;
}) {
  const id = randomUUID();
  await db.insert(glossaries).values({
    id,
    ownerId: input.ownerId,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    language: input.language?.trim() || null,
    visibility: input.visibility ?? "private",
  });
  return id;
}

export async function updateGlossary(
  id: string,
  ownerId: string,
  patch: {
    title?: string;
    description?: string | null;
    language?: string | null;
    visibility?: GlossaryVisibility;
  },
) {
  const [existing] = await db.select().from(glossaries).where(eq(glossaries.id, id)).limit(1);
  if (!existing || existing.ownerId !== ownerId) return false;
  await db
    .update(glossaries)
    .set({
      title: patch.title?.trim() ?? existing.title,
      description: patch.description !== undefined ? patch.description?.trim() || null : existing.description,
      language: patch.language !== undefined ? patch.language?.trim() || null : existing.language,
      visibility: patch.visibility ?? existing.visibility,
      updatedAt: sql`(current_timestamp)`,
    })
    .where(eq(glossaries.id, id));
  return true;
}

export async function deleteGlossary(id: string, ownerId: string) {
  const [existing] = await db.select().from(glossaries).where(eq(glossaries.id, id)).limit(1);
  if (!existing || existing.ownerId !== ownerId) return false;
  await db.delete(glossaries).where(eq(glossaries.id, id));
  return true;
}

export async function addGlossaryEntry(input: {
  glossaryId: string;
  ownerId: string;
  term: string;
  definition: string;
  notes?: string | null;
  aliases?: string | null;
}) {
  const [g] = await db.select().from(glossaries).where(eq(glossaries.id, input.glossaryId)).limit(1);
  if (!g || g.ownerId !== input.ownerId) return null;

  const term = input.term.trim();
  if (!term || !input.definition.trim()) return null;

  const id = randomUUID();
  await db.insert(glossaryEntries).values({
    id,
    glossaryId: input.glossaryId,
    term,
    normalizedTerm: normalizeGlossaryTerm(term),
    definition: input.definition.trim(),
    notes: input.notes?.trim() || null,
    aliases: input.aliases?.trim() || null,
    createdBy: input.ownerId,
  });
  await db
    .update(glossaries)
    .set({ updatedAt: sql`(current_timestamp)` })
    .where(eq(glossaries.id, input.glossaryId));
  return id;
}

export async function updateGlossaryEntry(
  entryId: string,
  ownerId: string,
  patch: { term?: string; definition?: string; notes?: string | null; aliases?: string | null },
) {
  const [row] = await db
    .select({
      entry: glossaryEntries,
      ownerId: glossaries.ownerId,
      glossaryId: glossaries.id,
    })
    .from(glossaryEntries)
    .innerJoin(glossaries, eq(glossaries.id, glossaryEntries.glossaryId))
    .where(eq(glossaryEntries.id, entryId))
    .limit(1);
  if (!row || row.ownerId !== ownerId) return false;

  const term = patch.term?.trim() ?? row.entry.term;
  await db
    .update(glossaryEntries)
    .set({
      term,
      normalizedTerm: normalizeGlossaryTerm(term),
      definition: patch.definition?.trim() ?? row.entry.definition,
      notes: patch.notes !== undefined ? patch.notes?.trim() || null : row.entry.notes,
      aliases: patch.aliases !== undefined ? patch.aliases?.trim() || null : row.entry.aliases,
      updatedAt: sql`(current_timestamp)`,
    })
    .where(eq(glossaryEntries.id, entryId));
  await db
    .update(glossaries)
    .set({ updatedAt: sql`(current_timestamp)` })
    .where(eq(glossaries.id, row.glossaryId));
  return true;
}

export async function deleteGlossaryEntry(entryId: string, ownerId: string) {
  const [row] = await db
    .select({ ownerId: glossaries.ownerId })
    .from(glossaryEntries)
    .innerJoin(glossaries, eq(glossaries.id, glossaryEntries.glossaryId))
    .where(eq(glossaryEntries.id, entryId))
    .limit(1);
  if (!row || row.ownerId !== ownerId) return false;
  await db.delete(glossaryEntries).where(eq(glossaryEntries.id, entryId));
  return true;
}

export type GlossaryHit = {
  entryId: string;
  glossaryId: string;
  glossaryTitle: string;
  term: string;
  definition: string;
  notes: string | null;
  mine: boolean;
};

/** Match a selection against public glossaries + the viewer's own. */
export async function lookupInGlossaries(
  raw: string,
  viewerId: string | null,
): Promise<GlossaryHit[]> {
  const needle = normalizeGlossaryTerm(raw);
  if (!needle || needle.length > 80) return [];

  const rows = await db
    .select({
      entryId: glossaryEntries.id,
      glossaryId: glossaries.id,
      glossaryTitle: glossaries.title,
      term: glossaryEntries.term,
      definition: glossaryEntries.definition,
      notes: glossaryEntries.notes,
      aliases: glossaryEntries.aliases,
      normalizedTerm: glossaryEntries.normalizedTerm,
      ownerId: glossaries.ownerId,
      visibility: glossaries.visibility,
    })
    .from(glossaryEntries)
    .innerJoin(glossaries, eq(glossaries.id, glossaryEntries.glossaryId))
    .where(
      viewerId
        ? or(eq(glossaries.visibility, "public"), eq(glossaries.ownerId, viewerId))
        : eq(glossaries.visibility, "public"),
    )
    .limit(200);

  const hits: GlossaryHit[] = [];
  for (const row of rows) {
    const aliases = (row.aliases ?? "")
      .split(/[,;|/]/)
      .map((a) => normalizeGlossaryTerm(a))
      .filter(Boolean);
    const keys = [row.normalizedTerm, ...aliases];
    const match =
      keys.includes(needle) ||
      keys.some((k) => k.length >= 3 && (needle.includes(k) || k.includes(needle)));
    if (!match) continue;
    hits.push({
      entryId: row.entryId,
      glossaryId: row.glossaryId,
      glossaryTitle: row.glossaryTitle,
      term: row.term,
      definition: row.definition,
      notes: row.notes,
      mine: viewerId === row.ownerId,
    });
    if (hits.length >= 8) break;
  }
  return hits;
}
