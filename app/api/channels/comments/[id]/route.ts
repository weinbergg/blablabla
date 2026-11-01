import { featureDenied } from "@/lib/features";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { deleteChannelComment, getChannelPermissions } from "@/lib/db/channels";
import { db } from "@/lib/db/client";
import { channelComments, channelPosts, channels } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const featureBlock = await featureDenied(["channels","comments"]); if (featureBlock) return featureBlock;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await context.params;
  const [comment] = await db.select().from(channelComments).where(eq(channelComments.id, id)).limit(1);
  if (!comment) return NextResponse.json({ error: "Комментарий не найден" }, { status: 404 });
  const [post] = await db.select().from(channelPosts).where(eq(channelPosts.id, comment.postId)).limit(1);
  const [channel] = post
    ? await db.select().from(channels).where(eq(channels.id, post.channelId)).limit(1)
    : [];
  const rights = channel ? await getChannelPermissions(channel, user) : null;
  const allowed =
    comment.authorId === user.id ||
    rights?.moderate;
  if (!allowed) return NextResponse.json({ error: "Нельзя удалить" }, { status: 403 });
  await deleteChannelComment(id);
  return NextResponse.json({ ok: true });
}
