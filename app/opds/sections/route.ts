import { getCategoryTree, isPubliclyVisibleCategory } from "@/lib/db/queries";
import { opdsResponse, renderOpdsFeed } from "@/lib/opds";
import { authorizeOpds, opdsHref } from "@/lib/opds-auth";
import { navigationEntry } from "@/lib/opds-feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Корневые разделы. Пустые не показываем — в читалке это тупик. */
export async function GET(request: Request) {
  const auth = await authorizeOpds(request);
  if (!auth.ok) return auth.response;
  const session = auth.session;

  const roots = (await getCategoryTree()).filter(isPubliclyVisibleCategory);

  const xml = renderOpdsFeed({
    id: "urn:blablablarden:opds:sections",
    title: "Разделы",
    selfHref: opdsHref(session, "/opds/sections"),
    kind: "navigation",
    upHref: opdsHref(session, "/opds"),
    entries: roots.map((node) =>
      navigationEntry({
        id: `urn:blablablarden:category:${node.id}`,
        title: node.name,
        summary: `${node.documentCount} текстов`,
        href: opdsHref(session, `/opds/sections/${node.id}`),
      }),
    ),
  });

  return opdsResponse(xml, "navigation");
}
