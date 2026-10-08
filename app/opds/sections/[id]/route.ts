import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { categories } from "@/lib/db/schema";
import { getChildCategories, getDocumentsForCategory, isPubliclyVisibleCategory } from "@/lib/db/queries";
import { opdsResponse, renderOpdsFeed } from "@/lib/opds";
import { authorizeOpds, opdsHref } from "@/lib/opds-auth";
import { documentEntry, hasFile, navigationEntry, pageFrom, paginate } from "@/lib/opds-feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Раздел: сначала подразделы «папками», затем сами книги. OPDS разрешает
 * смешанную ленту, и читалки показывают её как список, где папки сверху.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeOpds(request);
  if (!auth.ok) return auth.response;
  const session = auth.session;

  const { id } = await context.params;
  const [category] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  if (!category) {
    return new Response("Раздел не найден", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const [children, docs] = await Promise.all([
    getChildCategories(category.id),
    getDocumentsForCategory(category.id),
  ]);

  const page = pageFrom(request);
  const withFiles = docs.filter(hasFile);
  const { slice, hasNext, hasPrev } = paginate(withFiles, page);

  const entries = [
    ...(page === 1
      ? children.filter(isPubliclyVisibleCategory).map((child) =>
          navigationEntry({
            id: `urn:blablablarden:category:${child.id}`,
            title: child.name,
            summary: `${child.documentCount} текстов`,
            href: opdsHref(session, `/opds/sections/${child.id}`),
          }),
        )
      : []),
    ...slice.map((doc) => documentEntry(session, doc)),
  ];

  const xml = renderOpdsFeed({
    id: `urn:blablablarden:category:${category.id}`,
    title: category.name,
    subtitle: category.description ?? undefined,
    selfHref: opdsHref(session, `/opds/sections/${category.id}`, { page: String(page) }),
    kind: "acquisition",
    upHref: opdsHref(session, category.parentId ? `/opds/sections/${category.parentId}` : "/opds/sections"),
    nextHref: hasNext
      ? opdsHref(session, `/opds/sections/${category.id}`, { page: String(page + 1) })
      : null,
    prevHref: hasPrev
      ? opdsHref(session, `/opds/sections/${category.id}`, { page: String(page - 1) })
      : null,
    entries,
  });

  return opdsResponse(xml, "acquisition");
}
