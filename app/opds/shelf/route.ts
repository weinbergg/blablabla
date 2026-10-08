import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { authors, documentAuthors, documents, libraryItems } from "@/lib/db/schema";
import { opdsResponse, renderOpdsFeed } from "@/lib/opds";
import { authorizeOpds, opdsHref } from "@/lib/opds-auth";
import { documentEntry, hasFile } from "@/lib/opds-feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * «Моя полка» — то, что человек отложил на сайте, но читать собирается с
 * читалки. Самая нужная лента: на телефоне отметил, на устройстве скачал.
 */
export async function GET(request: Request) {
  const auth = await authorizeOpds(request);
  if (!auth.ok) return auth.response;
  const session = auth.session;

  const rows = await db
    .select({ document: documents, status: libraryItems.status, updatedAt: libraryItems.updatedAt })
    .from(libraryItems)
    .innerJoin(documents, eq(documents.id, libraryItems.documentId))
    .where(eq(libraryItems.userId, session.user.id))
    .orderBy(desc(libraryItems.updatedAt));

  const ids = rows.map((row) => row.document.id);
  const authorLinks = ids.length
    ? await db
        .select({ documentId: documentAuthors.documentId, position: documentAuthors.position, author: authors })
        .from(documentAuthors)
        .innerJoin(authors, eq(documentAuthors.authorId, authors.id))
        .where(inArray(documentAuthors.documentId, ids))
    : [];
  const authorsByDoc = new Map<string, { name: string }[]>();
  for (const link of authorLinks.sort((a, b) => a.position - b.position)) {
    authorsByDoc.set(link.documentId, [...(authorsByDoc.get(link.documentId) ?? []), link.author]);
  }

  const statusLabels = { want: "Хочу прочитать", reading: "Читаю", done: "Прочитано" } as const;

  const entries = rows
    .filter((row) => hasFile(row.document))
    .map((row) => {
      const entry = documentEntry(session, {
        ...row.document,
        authors: authorsByDoc.get(row.document.id) ?? [],
      });
      // Статус полки — в summary: в читалке видно, что уже прочитано.
      return { ...entry, summary: statusLabels[row.status] };
    });

  const xml = renderOpdsFeed({
    id: "urn:blablablarden:opds:shelf",
    title: "Моя полка",
    subtitle: entries.length ? undefined : "Пока пусто — отложите книги на сайте, они появятся здесь.",
    selfHref: opdsHref(session, "/opds/shelf"),
    kind: "acquisition",
    upHref: opdsHref(session, "/opds"),
    entries,
  });

  return opdsResponse(xml, "acquisition");
}
