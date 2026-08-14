import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { documents, forumTopics } from "@/lib/db/schema";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Войдите, чтобы начать тему." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    title?: string;
    body?: string;
    documentId?: string | null;
  } | null;

  const title = body?.title?.trim() ?? "";
  const text = body?.body?.trim() ?? "";
  if (title.length < 3 || title.length > 160) {
    return NextResponse.json({ error: "Заголовок — от 3 до 160 символов." }, { status: 400 });
  }
  if (text.length < 3 || text.length > 8000) {
    return NextResponse.json({ error: "Текст темы — от 3 до 8000 символов." }, { status: 400 });
  }

  let documentId: string | null = body?.documentId?.trim() || null;
  if (documentId) {
    const [doc] = await db.select({ id: documents.id }).from(documents).where(eq(documents.id, documentId)).limit(1);
    if (!doc) documentId = null;
  }

  const id = randomUUID();
  await db.insert(forumTopics).values({
    id,
    title,
    body: text,
    authorId: user.id,
    documentId,
    locked: 0,
  });

  return NextResponse.json({ id });
}
