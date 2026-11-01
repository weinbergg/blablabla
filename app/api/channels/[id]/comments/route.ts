import { featureDenied } from "@/lib/features";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { addChannelComment } from "@/lib/db/channels";
import { db } from "@/lib/db/client";
import { channelPosts } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const featureBlock = await featureDenied(["channels","comments"]); if (featureBlock) return featureBlock;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const { id: channelId } = await context.params;
  const body = (await request.json().catch(() => null)) as { postId?: unknown; body?: unknown; parentId?: unknown } | null;
  if (!body || typeof body.postId !== "string" || !body.postId || typeof body.body !== "string") {
    return NextResponse.json({ error: "Некорректный комментарий" }, { status: 400 });
  }

  const [post] = await db.select({ channelId: channelPosts.channelId, published: channelPosts.published, deletedAt: channelPosts.deletedAt }).from(channelPosts).where(eq(channelPosts.id, body.postId)).limit(1);
  if (!post || post.channelId !== channelId || post.published !== 1 || post.deletedAt) {
    return NextResponse.json({ error: "Запись не найдена" }, { status: 404 });
  }

  try {
    const comment = await addChannelComment({
      postId: body.postId,
      authorId: user.id,
      body: body.body,
      parentId: typeof body.parentId === "string" ? body.parentId : null,
    });
    return NextResponse.json({
      ...comment,
      postId: body.postId,
      authorId: user.id,
      authorName: user.name,
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось отправить" },
      { status: 400 },
    );
  }
}
