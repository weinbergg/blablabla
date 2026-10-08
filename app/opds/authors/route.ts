import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { authors, documentAuthors } from "@/lib/db/schema";
import { opdsResponse, renderOpdsFeed } from "@/lib/opds";
import { authorizeOpds, opdsHref } from "@/lib/opds-auth";
import { navigationEntry, pageFrom, paginate } from "@/lib/opds-feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Алфавитный список авторов, у которых есть хотя бы один текст. */
export async function GET(request: Request) {
  const auth = await authorizeOpds(request);
  if (!auth.ok) return auth.response;
  const session = auth.session;

  const rows = await db
    .select({
      id: authors.id,
      name: authors.name,
      slug: authors.slug,
      count: sql<number>`count(${documentAuthors.documentId})`,
    })
    .from(authors)
    .innerJoin(documentAuthors, eq(documentAuthors.authorId, authors.id))
    .groupBy(authors.id)
    .orderBy(asc(authors.name));

  const page = pageFrom(request);
  const { slice, hasNext, hasPrev } = paginate(rows, page);

  const xml = renderOpdsFeed({
    id: "urn:blablablarden:opds:authors",
    title: "Авторы",
    selfHref: opdsHref(session, "/opds/authors", { page: String(page) }),
    kind: "navigation",
    upHref: opdsHref(session, "/opds"),
    nextHref: hasNext ? opdsHref(session, "/opds/authors", { page: String(page + 1) }) : null,
    prevHref: hasPrev ? opdsHref(session, "/opds/authors", { page: String(page - 1) }) : null,
    entries: slice.map((author) =>
      navigationEntry({
        id: `urn:blablablarden:author:${author.id}`,
        title: author.name,
        summary: `${author.count} текстов`,
        href: opdsHref(session, `/opds/authors/${author.slug}`),
        kind: "acquisition",
      }),
    ),
  });

  return opdsResponse(xml, "navigation");
}
