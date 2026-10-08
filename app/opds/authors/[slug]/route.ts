import { getAuthorBySlug } from "@/lib/db/queries";
import { opdsResponse, renderOpdsFeed } from "@/lib/opds";
import { authorizeOpds, opdsHref } from "@/lib/opds-auth";
import { documentEntry, hasFile, pageFrom, paginate } from "@/lib/opds-feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const auth = await authorizeOpds(request);
  if (!auth.ok) return auth.response;
  const session = auth.session;

  const { slug } = await context.params;
  const found = await getAuthorBySlug(decodeURIComponent(slug));
  if (!found) {
    return new Response("Автор не найден", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const page = pageFrom(request);
  const { slice, hasNext, hasPrev } = paginate(found.documents.filter(hasFile), page);

  const xml = renderOpdsFeed({
    id: `urn:blablablarden:author:${found.author.id}`,
    title: found.author.name,
    selfHref: opdsHref(session, `/opds/authors/${slug}`, { page: String(page) }),
    kind: "acquisition",
    upHref: opdsHref(session, "/opds/authors"),
    nextHref: hasNext ? opdsHref(session, `/opds/authors/${slug}`, { page: String(page + 1) }) : null,
    prevHref: hasPrev ? opdsHref(session, `/opds/authors/${slug}`, { page: String(page - 1) }) : null,
    entries: slice.map((doc) => documentEntry(session, doc)),
  });

  return opdsResponse(xml, "acquisition");
}
