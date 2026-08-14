import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { forumPosts, forumTopics } from "@/lib/db/schema";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Войдите, чтобы ответить." }, { status: 401 });
  }

  const { id: topicId } = await params;
  const [topic] = await db.select().from(forumTopics).where(eq(forumTopics.id, topicId)).limit(1);
  if (!topic) {
    return NextResponse.json({ error: "Тема не найдена." }, { status: 404 });
  }
  if (topic.locked) {
    return NextResponse.json({ error: "Тема закрыта." }, { status: 403 });
  }

  const payload = (await request.json().catch(() => null)) as {
    body?: string;
    parentId?: string | null;
  } | null;
  const text = payload?.body?.trim() ?? "";
  if (text.length < 1 || text.length > 8000) {
    return NextResponse.json({ error: "Сообщение слишком короткое или длинное." }, { status: 400 });
  }

  const id = randomUUID();
  await db.insert(forumPosts).values({
    id,
    topicId,
    parentId: payload?.parentId?.trim() || null,
    authorId: user.id,
    body: text,
  });

  return NextResponse.json({ id });
}
