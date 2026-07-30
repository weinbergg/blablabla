import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { annotations, comments, documents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    documentId?: unknown;
    body?: unknown;
    page?: unknown;
    parentId?: unknown;
    annotationId?: unknown;
  } | null;

  const documentId = typeof body?.documentId === "string" ? body.documentId : "";
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  let page = typeof body?.page === "number" ? body.page : null;
  const parentId = typeof body?.parentId === "string" ? body.parentId : null;
  const annotationId = typeof body?.annotationId === "string" ? body.annotationId : null;

  if (!documentId || !text) {
    return NextResponse.json({ error: "Пустой комментарий." }, { status: 400 });
  }

  const [document] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);
  if (!document) {
    return NextResponse.json({ error: "Материал не найден" }, { status: 404 });
  }

  if (annotationId) {
    const [annotation] = await db
      .select()
      .from(annotations)
      .where(eq(annotations.id, annotationId))
      .limit(1);
    if (!annotation || annotation.documentId !== documentId) {
      return NextResponse.json({ error: "Пометка не найдена" }, { status: 404 });
    }
    if (annotation.visibility !== "public" || !annotation.allowDiscussion) {
      return NextResponse.json(
        { error: "У этой пометки не открыто обсуждение." },
        { status: 403 },
      );
    }
    // Keep the comment's own page in sync with its sticker, so the
    // "discussion by page/annotation" filter below stays meaningful.
    page = annotation.page;
  }

  await db.insert(comments).values({
    id: randomUUID(),
    documentId,
    parentId,
    annotationId,
    authorId: user.id,
    page,
    body: text,
  });

  revalidatePath(`/documents/${documentId}`);
  return NextResponse.json({ ok: true }, { status: 201 });
}
