import type Database from "better-sqlite3";
/** Render current public metadata only: a formerly public room may now be private. */
export function publicRoomLink(db: Database.Database, href: string, paidAllowed: boolean) {
  const slug = href.match(/^\/seminars\/([^/?#]+)(?:[?#].*)?$/)?.[1]; if (!slug) return null;
  return db.prepare(`SELECT title,kind,starts_at AS startsAt,summary FROM seminars WHERE slug=? AND status='open' AND access_mode IN ('open','legacy','paid') AND (?=1 OR (access_mode!='paid' AND price_kopeks=0))`).get(slug, Number(paidAllowed)) as { title: string; kind: string; startsAt: string | null; summary: string | null } | undefined ?? null;
}
