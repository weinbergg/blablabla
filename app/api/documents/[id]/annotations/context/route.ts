import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDocumentAnnotations } from "@/lib/db/queries";
import { validateAnchor } from "@/lib/publication-content";
import { sameQuoteAnchor } from "@/lib/quote-context";

/** Read-only POST keeps long exact quotations out of URLs/access logs. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "private, no-store" };
  const { id } = await context.params;
  let anchor;
  try {
    const raw = await request.text();
    if (raw.length > 18000) throw Error();
    anchor = validateAnchor(JSON.parse(raw));
    if (anchor.documentId !== id) throw Error();
  } catch { return NextResponse.json({ error: "Некорректная ссылка на цитату" }, { status: 400, headers }); }
  const user = await getCurrentUser();
  // Visibility is enforced by the existing query before any matching or response serialization.
  const visible = await getDocumentAnnotations(id, user?.id ?? null);
  const related = visible.filter(note => sameQuoteAnchor(note.textAnchor, anchor) && note.shape !== "drawing");
  return NextResponse.json({ items: related.slice(0, 20).map(note => ({ id: note.id, body: note.body, authorName: note.authorName, visibility: note.visibility })), hasMore: related.length > 20 }, { headers });
}
