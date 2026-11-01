import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db, sqlite } from "@/lib/db/client";
import { featureDenied } from "@/lib/features";
import { forumAccess } from "@/lib/forum-access";
import { annotations, comments, reports } from "@/lib/db/schema";

const TARGET_TYPES = new Set(["annotation", "comment", "channel_post", "forum_post"]);

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    targetType?: unknown;
    targetId?: unknown;
    reason?: unknown;
  } | null;

  const targetType = typeof body?.targetType === "string" && TARGET_TYPES.has(body.targetType) ? body.targetType : "";
  const targetId = typeof body?.targetId === "string" ? body.targetId : "";
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) : "";

  if (!targetType || !targetId) {
    return NextResponse.json({ error: "Некорректные данные жалобы." }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ error: "Укажите причину жалобы." }, { status: 400 });
  }

  if (targetType === "channel_post" || targetType === "forum_post") {
    const disabled = await featureDenied(targetType === "channel_post" ? "channels" : "forum", user); if (disabled) return disabled;
    let href = "";
    if (targetType === "channel_post") {
      const post = sqlite.prepare("SELECT p.slug,c.slug AS channelSlug FROM channel_posts p JOIN channels c ON c.id=p.channel_id WHERE p.id=? AND p.published=1 AND p.deleted_at IS NULL AND c.archived=0").get(targetId) as { slug: string; channelSlug: string } | undefined;
      if (post) href = `/channels/${post.channelSlug}/${post.slug}`;
    } else {
      const post = sqlite.prepare("SELECT topic_id FROM forum_posts WHERE id=? AND deleted_at IS NULL").get(targetId) as { topic_id: string } | undefined;
      if (post && (await forumAccess(post.topic_id, user)).read) href = `/discuss/${post.topic_id}?post=${targetId}#comment-${targetId}`;
    }
    if (!href) return NextResponse.json({ error: "Материал недоступен" }, { status: 404 });
    // Social reports use the existing private feedback queue and its reply/status workflow.
    // Legacy book reports keep their required document foreign key and moderation history.
    const text = `Жалоба на ${targetType === "channel_post" ? "публикацию канала" : "сообщение форума"}\n${href}\n\nПричина: ${reason}`;
    const recent = sqlite.prepare("SELECT count(*) n FROM feedback WHERE author_id=? AND datetime(created_at)>datetime('now','-1 hour')").get(user.id) as { n: number };
    if (recent.n >= 10) return NextResponse.json({ error: "Слишком много обращений. Попробуйте позже." }, { status: 429 });
    if (!sqlite.prepare("SELECT id FROM feedback WHERE author_id=? AND body=? AND status!='resolved'").get(user.id, text)) {
      sqlite.prepare("INSERT INTO feedback(id,author_id,name,body,status) VALUES(?,?,?,?,'new')").run(randomUUID(), user.id, user.name, text);
    }
    revalidatePath("/admin"); return NextResponse.json({ ok: true }, { status: 201 });
  }

  const documentId =
    targetType === "annotation"
      ? (await db.select({ documentId: annotations.documentId }).from(annotations).where(eq(annotations.id, targetId)).limit(1))[0]?.documentId
      : (await db.select({ documentId: comments.documentId }).from(comments).where(eq(comments.id, targetId)).limit(1))[0]?.documentId;

  if (!documentId) {
    return NextResponse.json({ error: "Материал не найден." }, { status: 404 });
  }

  await db.insert(reports).values({
    id: randomUUID(),
    targetType: targetType as "annotation" | "comment",
    targetId,
    documentId,
    reporterId: user.id,
    reason,
  });

  revalidatePath("/admin");
  return NextResponse.json({ ok: true }, { status: 201 });
}
