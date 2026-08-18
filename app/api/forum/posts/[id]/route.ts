import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { forumPosts } from "@/lib/db/schema";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const { id } = await context.params;
  const [post] = await db.select().from(forumPosts).where(eq(forumPosts.id, id)).limit(1);
  if (!post) {
    return NextResponse.json({ error: "Сообщение не найдено." }, { status: 404 });
  }
  if (post.authorId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Нет прав." }, { status: 403 });
  }

  const payload = (await request.json().catch(() => null)) as { body?: unknown } | null;
  const text = typeof payload?.body === "string" ? payload.body.trim() : "";
  if (!text || text.length > 8000) {
    return NextResponse.json({ error: "Сообщение слишком короткое или длинное." }, { status: 400 });
  }

  await db
    .update(forumPosts)
    .set({ body: text, updatedAt: new Date().toISOString() })
    .where(eq(forumPosts.id, id));
  revalidatePath(`/discuss/${post.topicId}`);
  revalidatePath("/discuss");
  return NextResponse.json({ ok: true });
}
