import { forumAccess } from "@/lib/forum-access";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { forumPosts, forumReactions } from "@/lib/db/schema";
import { isReactionKey } from "@/lib/reactions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await context.params;
  const [post] = await db.select({ id: forumPosts.id, topicId: forumPosts.topicId, deletedAt: forumPosts.deletedAt }).from(forumPosts).where(eq(forumPosts.id, id)).limit(1);
  if (!post) return NextResponse.json({ error: "Сообщение не найдено" }, { status: 404 });

  if (post.deletedAt || !(await forumAccess(post.topicId, user)).read) return NextResponse.json({ error: "Нет доступа к обсуждению" }, { status: 403 });
  const payload = (await request.json().catch(() => null)) as { key?: unknown } | null;
  const key = typeof payload?.key === "string" ? payload.key : "";
  if (!isReactionKey(key)) {
    return NextResponse.json({ error: "Такой реакции нет" }, { status: 400 });
  }

  const [existing] = await db
    .select()
    .from(forumReactions)
    .where(and(eq(forumReactions.postId, id), eq(forumReactions.userId, user.id), eq(forumReactions.emoji, key)))
    .limit(1);

  if (existing) {
    await db
      .delete(forumReactions)
      .where(and(eq(forumReactions.postId, id), eq(forumReactions.userId, user.id), eq(forumReactions.emoji, key)));
    return NextResponse.json({ ok: true, on: false });
  }

  await db.insert(forumReactions).values({ postId: id, userId: user.id, emoji: key });
  return NextResponse.json({ ok: true, on: true });
}
