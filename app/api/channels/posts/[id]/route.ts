import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canModerateChannel, deletePost, updatePost } from "@/lib/db/channels";
import { db } from "@/lib/db/client";
import { channelPosts, channels } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadOwned(postId: string, user: { id: string; role: string }) {
  const [post] = await db.select().from(channelPosts).where(eq(channelPosts.id, postId)).limit(1);
  if (!post) return { error: NextResponse.json({ error: "Запись не найдена" }, { status: 404 }) };
  const [channel] = await db.select().from(channels).where(eq(channels.id, post.channelId)).limit(1);
  if (!channel || !canModerateChannel(channel, user)) {
    return { error: NextResponse.json({ error: "Нельзя править чужую запись" }, { status: 403 }) };
  }
  return { post, channel };
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await context.params;
  const loaded = await loadOwned(id, user);
  if ("error" in loaded && loaded.error) return loaded.error;

  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    body?: string;
    documentId?: string | null;
    published?: boolean;
    pinned?: boolean;
  };
  await updatePost(id, body);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await context.params;
  const loaded = await loadOwned(id, user);
  if ("error" in loaded && loaded.error) return loaded.error;
  await deletePost(id);
  return NextResponse.json({ ok: true });
}
