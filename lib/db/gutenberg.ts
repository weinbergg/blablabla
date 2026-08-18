import { like, or } from "drizzle-orm";
import { db } from "./client";
import { documents } from "./schema";

export type GutenbergMatch = {
  id: string;
  title: string;
};

/** Resolve a Project Gutenberg ebook id to a catalog document, if we imported it. */
export async function findDocumentByGutenbergId(pgId: string): Promise<GutenbergMatch | null> {
  const id = pgId.replace(/\D/g, "");
  if (!id || id.length > 8) return null;

  const rows = await db
    .select({
      id: documents.id,
      title: documents.title,
      sourceNote: documents.sourceNote,
      description: documents.description,
    })
    .from(documents)
    .where(
      or(
        like(documents.sourceNote, `%Gutenberg%${id}%`),
        like(documents.description, `%Gutenberg%${id}%`),
      ),
    )
    .limit(40);

  const exact = new RegExp(`(?:Gutenberg\\s*(?:#|№|\\(№)|№)\\s*${id}(?!\\d)`, "i");
  const match = rows.find((row) => exact.test(`${row.sourceNote ?? ""} ${row.description ?? ""}`));
  if (!match) return null;
  return { id: match.id, title: match.title };
}
