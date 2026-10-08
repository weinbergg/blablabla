import { getAllDocumentsForSearch, matchesSearch } from "@/lib/db/queries";
import { opdsResponse, renderOpdsFeed } from "@/lib/opds";
import { authorizeOpds, opdsHref } from "@/lib/opds-auth";
import { documentEntry, hasFile, pageFrom, paginate } from "@/lib/opds-feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Поиск из читалки. Критерии те же, что на сайте (lib/db/queries.ts). */
export async function GET(request: Request) {
  const auth = await authorizeOpds(request);
  if (!auth.ok) return auth.response;
  const session = auth.session;

  const query = (new URL(request.url).searchParams.get("q") ?? "").trim();
  const page = pageFrom(request);

  const found = query
    ? (await getAllDocumentsForSearch()).filter(
        (doc) =>
          hasFile(doc) &&
          matchesSearch(
            query,
            doc.title,
            doc.alternateTitle,
            doc.description,
            doc.year,
            ...doc.authors.map((author) => author.name),
            ...doc.subjects.map((subject) => subject.name),
            ...doc.tags.map((tag) => tag.name),
          ),
      )
    : [];

  const { slice, hasNext, hasPrev } = paginate(found, page);

  const xml = renderOpdsFeed({
    id: `urn:blablablarden:opds:search:${encodeURIComponent(query)}`,
    title: query ? `Поиск: ${query}` : "Поиск",
    subtitle: query ? `Найдено: ${found.length}` : "Введите запрос в поле поиска читалки.",
    selfHref: opdsHref(session, "/opds/search", { q: query, page: String(page) }),
    kind: "acquisition",
    upHref: opdsHref(session, "/opds"),
    nextHref: hasNext ? opdsHref(session, "/opds/search", { q: query, page: String(page + 1) }) : null,
    prevHref: hasPrev ? opdsHref(session, "/opds/search", { q: query, page: String(page - 1) }) : null,
    entries: slice.map((doc) => documentEntry(session, doc)),
  });

  return opdsResponse(xml, "acquisition");
}
