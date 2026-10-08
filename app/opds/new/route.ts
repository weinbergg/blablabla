import { getRecentDocuments } from "@/lib/db/queries";
import { opdsResponse, renderOpdsFeed } from "@/lib/opds";
import { authorizeOpds, opdsHref } from "@/lib/opds-auth";
import { documentEntry, hasFile, OPDS_PAGE_SIZE } from "@/lib/opds-feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Новые поступления — одна порция, без листания: дальше человек идёт в разделы. */
export async function GET(request: Request) {
  const auth = await authorizeOpds(request);
  if (!auth.ok) return auth.response;
  const session = auth.session;

  const docs = (await getRecentDocuments(OPDS_PAGE_SIZE * 2)).filter(hasFile);

  const xml = renderOpdsFeed({
    id: "urn:blablablarden:opds:new",
    title: "Новые поступления",
    selfHref: opdsHref(session, "/opds/new"),
    kind: "acquisition",
    upHref: opdsHref(session, "/opds"),
    entries: docs.slice(0, OPDS_PAGE_SIZE).map((doc) => documentEntry(session, doc)),
  });

  return opdsResponse(xml, "acquisition");
}
