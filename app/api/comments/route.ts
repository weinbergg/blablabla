import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { comments, documents } from "@/lib/db/schema";
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
  } | null;

  const documentId = typeof body?.documentId === "string" ? body.documentId : "";
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  const page = typeof body?.page === "number" ? body.page : null;
  const parentId = typeof body?.parentId === "string" ? body.parentId : null;

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

  await db.insert(comments).values({
    id: randomUUID(),
    documentId,
    parentId,
    authorId: user.id,
    page,
    body: text,
  });

  revalidatePath(`/documents/${documentId}`);
  return NextResponse.json({ ok: true }, { status: 201 });
}
