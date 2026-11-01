import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { documents } from "@/lib/db/schema";
import { verifyFileToken } from "@/lib/file-access";
import { fileTextVersion } from "@/lib/file-version";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const token = await verifyFileToken(new URL(request.url).searchParams.get("t"));
  if (!token || token.d !== id) return NextResponse.json({ error: "Обновите страницу книги, чтобы получить ссылку на фрагмент." }, { status: 403 });
  const [doc] = await db.select({ title: documents.title, fileUrl: documents.fileUrl }).from(documents).where(eq(documents.id, id)).limit(1);
  if (!doc?.fileUrl) return NextResponse.json({ error: "Произведение не найдено." }, { status: 404 });
  try { return NextResponse.json({ title: doc.title, textVersion: await fileTextVersion(doc.fileUrl) }, { headers: { "Cache-Control": "private, max-age=30" } }); }
  catch { return NextResponse.json({ error: "Не удалось проверить версию текста. Попробуйте ещё раз." }, { status: 503 }); }
}
