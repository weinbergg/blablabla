import "server-only";

import { MIME_BY_FILE_TYPE, type OpdsEntry, OPDS_ACQUISITION_TYPE, OPDS_NAVIGATION_TYPE } from "@/lib/opds";
import { opdsHref, type OpdsSession } from "@/lib/opds-auth";

/** Сколько книг отдаём в одной порции: читалки плохо переносят ленты на
 * тысячи записей, поэтому листаем через rel="next". */
export const OPDS_PAGE_SIZE = 50;

type DocumentLike = {
  id: string;
  title: string;
  description?: string | null;
  year?: string | null;
  language?: string | null;
  fileType: string;
  fileUrl?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
  authors?: { name: string }[];
  tags?: { name: string }[];
};

export function documentEntry(session: OpdsSession, doc: DocumentLike): OpdsEntry {
  const mime = MIME_BY_FILE_TYPE[doc.fileType?.toUpperCase() ?? ""] ?? "application/octet-stream";
  return {
    id: `urn:blablablarden:document:${doc.id}`,
    title: doc.title,
    updated: doc.updatedAt ?? doc.createdAt ?? undefined,
    authors: (doc.authors ?? []).map((author) => author.name),
    categories: (doc.tags ?? []).map((tag) => tag.name),
    language: doc.language ?? null,
    issued: doc.year ?? null,
    content: doc.description ?? null,
    links: [
      {
        rel: "http://opds-spec.org/acquisition",
        href: opdsHref(session, `/opds/download/${doc.id}`),
        type: mime,
        title: "Скачать",
      },
      {
        rel: "alternate",
        href: `/documents/${doc.id}`,
        type: "text/html",
        title: "Страница книги на сайте",
      },
    ],
  };
}

export function navigationEntry(options: {
  id: string;
  title: string;
  summary?: string | null;
  href: string;
  kind?: "navigation" | "acquisition";
}): OpdsEntry {
  return {
    id: options.id,
    title: options.title,
    summary: options.summary ?? null,
    links: [
      {
        rel: "subsection",
        href: options.href,
        type: options.kind === "acquisition" ? OPDS_ACQUISITION_TYPE : OPDS_NAVIGATION_TYPE,
      },
    ],
  };
}

/** Книга без файла в каталоге быть может (карточка-заготовка), но в читалке
 * ей делать нечего — скачивать нечего. */
export function hasFile(doc: { fileUrl?: string | null }) {
  return Boolean(doc.fileUrl && doc.fileUrl.startsWith("/uploads/"));
}

export function pageFrom(request: Request) {
  const raw = Number(new URL(request.url).searchParams.get("page") ?? "1");
  return Number.isFinite(raw) && raw > 1 ? Math.floor(raw) : 1;
}

export function paginate<T>(items: T[], page: number) {
  const start = (page - 1) * OPDS_PAGE_SIZE;
  return {
    slice: items.slice(start, start + OPDS_PAGE_SIZE),
    hasNext: start + OPDS_PAGE_SIZE < items.length,
    hasPrev: page > 1,
  };
}
