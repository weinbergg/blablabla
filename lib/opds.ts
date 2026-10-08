import "server-only";

/**
 * OPDS 1.2 — формат каталога, который понимают читалки (KOReader, FBReader,
 * Moon+ Reader, PocketBook, Calibre). По сути это Atom-лента: один тип
 * документа описывает «папки» (навигация), другой — книги со ссылками на
 * скачивание.
 *
 * Здесь только сборка XML. Кто имеет право его получить, решает маршрут.
 */

export const OPDS_NAVIGATION_TYPE = "application/atom+xml;profile=opds-catalog;kind=navigation";
export const OPDS_ACQUISITION_TYPE = "application/atom+xml;profile=opds-catalog;kind=acquisition";

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // Управляющие символы ломают разбор XML на читалках наглухо.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

export type OpdsLink = {
  href: string;
  type: string;
  rel?: string;
  title?: string;
};

export type OpdsEntry = {
  id: string;
  title: string;
  updated?: string;
  authors?: string[];
  summary?: string | null;
  content?: string | null;
  categories?: string[];
  language?: string | null;
  issued?: string | null;
  links: OpdsLink[];
};

function renderLink(link: OpdsLink) {
  const rel = link.rel ? ` rel="${escapeXml(link.rel)}"` : "";
  const title = link.title ? ` title="${escapeXml(link.title)}"` : "";
  return `    <link${rel} href="${escapeXml(link.href)}" type="${escapeXml(link.type)}"${title}/>`;
}

function renderEntry(entry: OpdsEntry) {
  const parts: string[] = [
    "  <entry>",
    `    <id>${escapeXml(entry.id)}</id>`,
    `    <title>${escapeXml(entry.title)}</title>`,
    `    <updated>${entry.updated ?? new Date().toISOString()}</updated>`,
  ];
  for (const author of entry.authors ?? []) {
    parts.push(`    <author><name>${escapeXml(author)}</name></author>`);
  }
  for (const category of entry.categories ?? []) {
    parts.push(`    <category term="${escapeXml(category)}"/>`);
  }
  if (entry.language) parts.push(`    <dc:language>${escapeXml(entry.language)}</dc:language>`);
  if (entry.issued) parts.push(`    <dc:issued>${escapeXml(entry.issued)}</dc:issued>`);
  if (entry.summary) parts.push(`    <summary type="text">${escapeXml(entry.summary)}</summary>`);
  if (entry.content) parts.push(`    <content type="text">${escapeXml(entry.content)}</content>`);
  parts.push(...entry.links.map(renderLink));
  parts.push("  </entry>");
  return parts.join("\n");
}

export function renderOpdsFeed(options: {
  id: string;
  title: string;
  subtitle?: string;
  selfHref: string;
  kind: "navigation" | "acquisition";
  upHref?: string | null;
  searchHref?: string | null;
  nextHref?: string | null;
  prevHref?: string | null;
  entries: OpdsEntry[];
}): string {
  const selfType = options.kind === "navigation" ? OPDS_NAVIGATION_TYPE : OPDS_ACQUISITION_TYPE;
  const links: OpdsLink[] = [
    { rel: "self", href: options.selfHref, type: selfType },
    { rel: "start", href: "/opds", type: OPDS_NAVIGATION_TYPE },
  ];
  if (options.upHref) links.push({ rel: "up", href: options.upHref, type: OPDS_NAVIGATION_TYPE });
  if (options.prevHref) links.push({ rel: "previous", href: options.prevHref, type: selfType });
  if (options.nextHref) links.push({ rel: "next", href: options.nextHref, type: selfType });
  if (options.searchHref) {
    links.push({
      rel: "search",
      href: options.searchHref,
      type: "application/opensearchdescription+xml",
      title: "Поиск по библиотеке",
    });
  }

  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:dc="http://purl.org/dc/terms/"
      xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>${escapeXml(options.id)}</id>
  <title>${escapeXml(options.title)}</title>
  ${options.subtitle ? `<subtitle>${escapeXml(options.subtitle)}</subtitle>` : ""}
  <updated>${new Date().toISOString()}</updated>
  <author><name>blablablarden</name></author>
${links.map(renderLink).join("\n")}
${options.entries.map(renderEntry).join("\n")}
</feed>
`;
}

export function opdsResponse(xml: string, kind: "navigation" | "acquisition") {
  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": `${kind === "navigation" ? OPDS_NAVIGATION_TYPE : OPDS_ACQUISITION_TYPE}; charset=utf-8`,
      "Cache-Control": "private, no-store",
    },
  });
}

/** Ответ, после которого читалка покажет окно логина. */
export function opdsUnauthorized(message: string) {
  return new Response(message, {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="blablablarden OPDS", charset="UTF-8"',
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

export const MIME_BY_FILE_TYPE: Record<string, string> = {
  PDF: "application/pdf",
  EPUB: "application/epub+zip",
  TXT: "text/plain",
  FB2: "application/xml",
  MOBI: "application/x-mobipocket-ebook",
  DJVU: "image/vnd.djvu",
};
