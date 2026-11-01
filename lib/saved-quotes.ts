import type Database from "better-sqlite3";
import { validateAnchor } from "./publication-content";

/** Private picker: always scoped to the authenticated owner, never an input user ID. */
export function savedQuotes(db: Database.Database, ownerId: string, page = 1) {
  const rows = db.prepare(`SELECT a.id,a.body,a.text_anchor AS anchorJson,d.title,d.file_type AS format,
    (SELECT group_concat(name, ', ') FROM authors au JOIN document_authors da ON da.author_id=au.id WHERE da.document_id=d.id) AS authors
    FROM annotations a JOIN documents d ON d.id=a.document_id
    WHERE a.author_id=? AND a.text_anchor IS NOT NULL ORDER BY a.created_at DESC,a.id DESC LIMIT 21 OFFSET ?`).all(ownerId, (page - 1) * 20) as { id: string; body: string; anchorJson: string; title: string; format: string; authors: string | null }[];
  return { quotes: rows.slice(0, 20).flatMap(row => {
    try { return [{ id: row.id, comment: row.body, anchor: validateAnchor(JSON.parse(row.anchorJson)), title: row.title, format: row.format?.toLowerCase(), authors: row.authors || "" }]; }
    catch { return []; }
  }), hasMore: rows.length > 20 };
}
