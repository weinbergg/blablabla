import { getCategoryTree } from "@/lib/db/queries";
import { opdsResponse, renderOpdsFeed } from "@/lib/opds";
import { authorizeOpds, opdsHref } from "@/lib/opds-auth";
import { navigationEntry } from "@/lib/opds-feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Корень OPDS-каталога — то, что человек вбивает в читалку:
 *   https://blablablarden.ru/opds
 * Логин любой, пароль — ключ из личного кабинета.
 *
 * Корень намеренно только с «папками»: читалки показывают его как меню.
 */
export async function GET(request: Request) {
  const auth = await authorizeOpds(request);
  if (!auth.ok) return auth.response;
  const session = auth.session;

  const tree = await getCategoryTree();
  const sectionCount = tree.length;
  const total = tree.reduce((sum, node) => sum + node.documentCount, 0);

  const entries = [
    navigationEntry({
      id: "urn:blablablarden:opds:new",
      title: "Новые поступления",
      summary: "Последнее, что появилось в библиотеке",
      href: opdsHref(session, "/opds/new"),
      kind: "acquisition",
    }),
    navigationEntry({
      id: "urn:blablablarden:opds:sections",
      title: "Разделы",
      summary: `${sectionCount} разделов, ${total} текстов`,
      href: opdsHref(session, "/opds/sections"),
    }),
    navigationEntry({
      id: "urn:blablablarden:opds:authors",
      title: "Авторы",
      summary: "Алфавитный список",
      href: opdsHref(session, "/opds/authors"),
    }),
    navigationEntry({
      id: "urn:blablablarden:opds:shelf",
      title: "Моя полка",
      summary: "Книги, отложенные на сайте",
      href: opdsHref(session, "/opds/shelf"),
      kind: "acquisition",
    }),
  ];

  const xml = renderOpdsFeed({
    id: "urn:blablablarden:opds:root",
    title: "blablablarden",
    subtitle: `Читательский билет: ${session.entitlements.planName}. ${
      session.limit > 0
        ? `Сегодня доступно ещё ${Math.max(0, session.limit - session.used)} скачиваний.`
        : "Скачивания без ограничений."
    }`,
    selfHref: opdsHref(session, "/opds"),
    kind: "navigation",
    searchHref: opdsHref(session, "/opds/opensearch.xml"),
    entries,
  });

  return opdsResponse(xml, "navigation");
}
