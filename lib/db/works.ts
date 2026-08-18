import { asc, eq, inArray } from "drizzle-orm";
import { db } from "./client";
import { authors, documentAuthors, documents, workDocuments, works } from "./schema";
import { WORK_ROLE_LABELS } from "@/lib/work-keys";

export type WorkEdition = {
  id: string;
  title: string;
  year: string | null;
  language: string | null;
  fileType: string;
  role: string;
  roleLabel: string;
  authors: { id: string; name: string }[];
};

export type WorkGroup = {
  id: string;
  slug: string;
  title: string;
  editions: WorkEdition[];
};

async function withAuthors<T extends { id: string }>(rows: T[]) {
  if (!rows.length) return rows.map((row) => ({ ...row, authors: [] as { id: string; name: string }[] }));
  const links = await db
    .select({
      documentId: documentAuthors.documentId,
      id: authors.id,
      name: authors.name,
    })
    .from(documentAuthors)
    .innerJoin(authors, eq(documentAuthors.authorId, authors.id))
    .where(inArray(documentAuthors.documentId, rows.map((row) => row.id)));
  const byDoc = new Map<string, { id: string; name: string }[]>();
  for (const link of links) {
    const list = byDoc.get(link.documentId) ?? [];
    list.push({ id: link.id, name: link.name });
    byDoc.set(link.documentId, list);
  }
  return rows.map((row) => ({ ...row, authors: byDoc.get(row.id) ?? [] }));
}

function toEditions(
  rows: {
    id: string;
    title: string;
    year: string | null;
    language: string | null;
    fileType: string;
    role: string;
    authors: { id: string; name: string }[];
  }[],
): WorkEdition[] {
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    year: row.year,
    language: row.language,
    fileType: row.fileType,
    role: row.role,
    roleLabel: WORK_ROLE_LABELS[row.role] ?? row.role,
    authors: row.authors,
  }));
}

export async function getWorkForDocument(documentId: string): Promise<WorkGroup | null> {
  const [link] = await db
    .select({
      workId: workDocuments.workId,
      workTitle: works.title,
      workSlug: works.slug,
    })
    .from(workDocuments)
    .innerJoin(works, eq(workDocuments.workId, works.id))
    .where(eq(workDocuments.documentId, documentId))
    .limit(1);
  if (!link) return null;

  const rows = await db
    .select({
      id: documents.id,
      title: documents.title,
      year: documents.year,
      language: documents.language,
      fileType: documents.fileType,
      role: workDocuments.role,
    })
    .from(workDocuments)
    .innerJoin(documents, eq(workDocuments.documentId, documents.id))
    .where(eq(workDocuments.workId, link.workId))
    .orderBy(asc(documents.title));

  if (rows.length < 2) return null;

  return {
    id: link.workId,
    slug: link.workSlug,
    title: link.workTitle,
    editions: toEditions(await withAuthors(rows)),
  };
}

export async function getWorksForAuthor(authorId: string): Promise<WorkGroup[]> {
  const workRows = await db.select().from(works).where(eq(works.authorId, authorId));
  const groups: WorkGroup[] = [];
  for (const work of workRows) {
    const rows = await db
      .select({
        id: documents.id,
        title: documents.title,
        year: documents.year,
        language: documents.language,
        fileType: documents.fileType,
        role: workDocuments.role,
      })
      .from(workDocuments)
      .innerJoin(documents, eq(workDocuments.documentId, documents.id))
      .where(eq(workDocuments.workId, work.id))
      .orderBy(asc(documents.title));
    if (rows.length < 2) continue;
    groups.push({
      id: work.id,
      slug: work.slug,
      title: work.title,
      editions: toEditions(await withAuthors(rows)),
    });
  }
  groups.sort((a, b) => b.editions.length - a.editions.length || a.title.localeCompare(b.title, "ru"));
  return groups;
}

export async function siblingDocumentIds(documentId: string): Promise<Set<string>> {
  const [link] = await db
    .select({ workId: workDocuments.workId })
    .from(workDocuments)
    .where(eq(workDocuments.documentId, documentId))
    .limit(1);
  if (!link) return new Set();
  const rows = await db
    .select({ documentId: workDocuments.documentId })
    .from(workDocuments)
    .where(eq(workDocuments.workId, link.workId));
  return new Set(rows.map((row) => row.documentId));
}
