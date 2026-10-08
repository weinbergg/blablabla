import { escapeXml, OPDS_ACQUISITION_TYPE } from "@/lib/opds";
import { authorizeOpds } from "@/lib/opds-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Описание поиска в формате OpenSearch: по нему читалка понимает, куда
 * подставлять введённый запрос. Без этого файла поле поиска в приложении
 * просто не появится.
 */
export async function GET(request: Request) {
  const auth = await authorizeOpds(request);
  if (!auth.ok) return auth.response;

  const key = auth.session.key;
  const template = `/opds/search?q={searchTerms}${key ? `&amp;key=${escapeXml(key)}` : ""}`;

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>blablablarden</ShortName>
  <Description>Поиск по библиотеке blablablarden</Description>
  <InputEncoding>UTF-8</InputEncoding>
  <Url type="${OPDS_ACQUISITION_TYPE}" template="${template}"/>
</OpenSearchDescription>
`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/opensearchdescription+xml; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}
