import { featureDenied } from "@/lib/features";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { deletePost, getChannelPermissions } from "@/lib/db/channels";
import { db, sqlite } from "@/lib/db/client";
import { channelPosts, channels } from "@/lib/db/schema";
import { RevisionConflict, savePublication } from "@/lib/publication-storage";

async function load(postId: string, user: { id: string; role: string } | null) {
  const [post] = await db.select().from(channelPosts).where(eq(channelPosts.id, postId)).limit(1);
  if (!post || post.deletedAt) return null;
  const [channel] = await db.select().from(channels).where(eq(channels.id, post.channelId)).limit(1);
  if (!channel) return null;
  return { post, channel, rights: await getChannelPermissions(channel, user) };
}
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const featureBlock = await featureDenied(["channels"]); if (featureBlock) return featureBlock;
  const data = await load((await context.params).id, await getCurrentUser());
  if (!data || (!data.rights.readDrafts && (!data.post.published || data.channel.archived))) return NextResponse.json({ error: "Запись не найдена" }, { status: 404 });
  return NextResponse.json({ ...data.post, channelSlug: data.channel.slug, rights: data.rights }, { headers: { "Cache-Control": "private, no-store" } });
}
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const featureBlock = await featureDenied(["channels"]); if (featureBlock) return featureBlock;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const data = await load((await context.params).id, user);
  if (!data) return NextResponse.json({ error: "Запись не найдена" }, { status: 404 });
  try {
    const input = await request.json();
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Некорректная публикация");
    const discussionOnly = typeof input.commentsOpen === "boolean" && Object.keys(input).every(key => key === "commentsOpen" || key === "revision");
    if (!data.rights.publish && !(discussionOnly && data.rights.moderate)) return NextResponse.json({ error: "Нет прав на редактирование публикаций" }, { status: 403 });
    if (data.post.contentJson && (input.content !== undefined || input.body !== undefined) && input.revision === undefined) throw new RevisionConflict("Обновите страницу редактора перед сохранением");
    return NextResponse.json({ ok: true, ...savePublication(sqlite, data.channel.id, user.id, input, data.post.id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось сохранить" }, { status: error instanceof RevisionConflict ? 409 : 400 });
  }
}
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const featureBlock = await featureDenied(["channels"]); if (featureBlock) return featureBlock;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const data = await load((await context.params).id, user);
  if (!data) return NextResponse.json({ error: "Запись не найдена" }, { status: 404 });
  if (!data.rights.publish) return NextResponse.json({ error: "Нет прав на удаление публикаций" }, { status: 403 });
  await deletePost(data.post.id);
  return NextResponse.json({ ok: true });
}
