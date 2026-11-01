import { NextResponse } from "next/server";
import { getDocumentById } from "@/lib/db/queries";

/** The same public catalogue metadata as the document page; no file URL or read token. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) return NextResponse.json({ error: "Книга не найдена" }, { status: 404 });
  const book = await getDocumentById(id);
  if (!book) return NextResponse.json({ error: "Книга не найдена" }, { status: 404 });
  return NextResponse.json({ id: book.id, title: book.title, authors: book.authors.map(a => a.name).join(", "), format: book.fileType.toLowerCase(), language: book.language, year: book.year, description: book.description?.slice(0, 500) || null }, { headers: { "Cache-Control": "private, no-store" } });
}
