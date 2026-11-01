import { forumAccess } from "@/lib/forum-access";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { bindDiscussionFiles, discussionSource } from "@/lib/forum-storage";
import { db, sqlite } from "@/lib/db/client";
import { forumPosts, forumTopics } from "@/lib/db/schema";
import { sanitizePlainText } from "@/lib/sanitize-text";

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
  if (!(await forumAccess(topicId, user)).write) return NextResponse.json({ error: "Нет доступа к обсуждению" }, { status: 403 });
  if (topic.locked) {
    return NextResponse.json({ error: "Тема закрыта." }, { status: 403 });
  }

  const payload = (await request.json().catch(() => null)) as {
    body?: string;
    parentId?: string | null;
    attachmentIds?: string[];
    documentId?: unknown;
    anchor?: unknown;
  } | null;
  const text = sanitizePlainText(payload?.body, 8000);
  const attachmentIds = Array.isArray(payload?.attachmentIds)
    ? payload.attachmentIds.filter((item): item is string => typeof item === "string")
    : [];
  if (text.length > 8000) {
    return NextResponse.json({ error: "Сообщение слишком длинное." }, { status: 400 });
  }
  if (text.length < 1 && attachmentIds.length === 0 && !payload?.documentId && !payload?.anchor) {
    return NextResponse.json({ error: "Напишите текст или прикрепите файл." }, { status: 400 });
  }

  const parentId = typeof payload?.parentId === "string" ? payload.parentId.trim() || null : null;
  if (parentId) {
    const [parent] = await db.select({ id: forumPosts.id, topicId: forumPosts.topicId, deletedAt: forumPosts.deletedAt }).from(forumPosts).where(eq(forumPosts.id, parentId)).limit(1);
    if (!parent || parent.deletedAt || parent.topicId !== topicId) {
      return NextResponse.json({ error: "Родительское сообщение не найдено." }, { status: 400 });
    }
  }

  const id = randomUUID();
  try {
    sqlite.transaction(() => {
      const source = discussionSource(sqlite, payload ?? {});
      if (topic.seminarId && source.documentId && source.documentId !== topic.documentId) throw new Error("Выберите произведение этой комнаты");
      const recent = sqlite.prepare("SELECT count(*) n FROM forum_posts WHERE author_id=? AND datetime(created_at)>datetime('now','-1 minute')").get(user.id) as { n: number };
      if (recent.n >= 20) throw new Error("Слишком много сообщений. Подождите немного.");
      sqlite.prepare("INSERT INTO forum_posts(id,topic_id,parent_id,author_id,body,document_id,anchor_json) VALUES(?,?,?,?,?,?,?)").run(id, topicId, parentId, user.id, text, source.documentId, source.anchorJson);
      bindDiscussionFiles(sqlite, user.id, payload?.attachmentIds, "post", id);
    }).immediate();
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Не удалось отправить ответ" }, { status: 400 }); }
  logActivity({ userId: user.id, email: user.email, action: "discuss.reply", targetType: "topic", targetId: topicId });
  revalidatePath(`/discuss/${topicId}`);
  revalidatePath("/discuss");
  return NextResponse.json({ id });
}
