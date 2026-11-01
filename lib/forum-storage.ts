import type Database from "better-sqlite3";
import { validateAnchor } from "./publication-content";
export function discussionSource(db: Database.Database, input: { documentId?: unknown; anchor?: unknown }) {
  const anchor = input.anchor ? validateAnchor(input.anchor) : null;
  const documentId = anchor?.documentId ?? (typeof input.documentId === "string" ? input.documentId : null);
  if (anchor && input.documentId && input.documentId !== anchor.documentId) throw new Error("Книга и цитата относятся к разным произведениям");
  if (documentId && !db.prepare("SELECT id FROM documents WHERE id=?").get(documentId)) throw new Error("Книга не найдена");
  return { documentId, anchorJson: anchor ? JSON.stringify(anchor) : null };
}
/** Call inside the same transaction that creates the topic/post. */
export function bindDiscussionFiles(db: Database.Database, userId: string, ids: unknown, parentType: "topic" | "post", parentId: string) {
  if (ids === undefined) return;
  if (!Array.isArray(ids) || ids.length > 8 || ids.some(id => typeof id !== "string")) throw new Error("Можно прикрепить до восьми файлов");
  for (const id of new Set<string>(ids)) {
    const file = db.prepare("SELECT owner_id,parent_id,parent_type FROM community_attachments WHERE id=?").get(id) as { owner_id: string; parent_id: string | null; parent_type: string | null } | undefined;
    if (!file || file.owner_id !== userId || (file.parent_id && (file.parent_id !== parentId || file.parent_type !== parentType))) throw new Error("Нет доступа к одному из вложений");
    db.prepare("UPDATE community_attachments SET parent_type=?,parent_id=? WHERE id=?").run(parentType, parentId, id);
  }
}
