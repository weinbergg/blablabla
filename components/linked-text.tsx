import type { ReactNode } from "react";
import { PublicationLink } from "./publication-link";

const LINK_RE =
  /(https?:\/\/[^\s<]+|\/(?:documents|glossaries|discuss|seminars|news|channels|catalog)\/[A-Za-z0-9_\-/.%]+(?:[?#][^\s<]+)?)/g;

export function linkifyPlain(text: string, keyBase = 0): ReactNode[] {
  const parts = text.split(LINK_RE);
  return parts.map((part, index) => {
    if (!part) return null;
    if (index % 2 === 1) {
      const href = part.startsWith("http") ? part : part;
      return (
        <PublicationLink key={`${keyBase}-${index}`} href={href} className="underline underline-offset-2 hover:text-rust">
          {part}
        </PublicationLink>
      );
    }
    return part;
  });
}
