import { featureDenied } from "@/lib/features";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { bindDiscussionFiles, discussionSource } from "@/lib/forum-storage";
import { listForumTopics } from "@/lib/db/forum";
import { sqlite } from "@/lib/db/client";
import { isForumCategory } from "@/lib/forum-meta";
import { sanitizePlainText, sanitizeTitle } from "@/lib/sanitize-text";

export async function GET(request: Request) {
  const featureBlock = await featureDenied(["forum"]); if (featureBlock) return featureBlock;
  const { searchParams } = new URL(request.url);
  const rawLimit = Number.parseInt(searchParams.get("limit") ?? "8", 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(12, Math.max(1, rawLimit)) : 8;
  const topics = await listForumTopics({ limit });
  return NextResponse.json({
    topics: topics
      .filter((topic) => !topic.locked)
      .map((topic) => ({
        id: topic.id,
        title: topic.title,
        documentId: topic.documentId,
        documentTitle: topic.documentTitle,
      })),
  });
}

export async function POST(request: Request) {
  const featureBlock = await featureDenied(["forum"]); if (featureBlock) return featureBlock;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Войдите, чтобы начать тему." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    title?: string;
    body?: string;
    documentId?: string | null;
    category?: string;
    attachmentIds?: string[];
    anchor?: unknown;
    watch?: boolean;
  } | null;

  const title = sanitizeTitle(body?.title);
  const text = sanitizePlainText(body?.body, 8000);
  if (title.length < 3 || title.length > 160) {
    return NextResponse.json({ error: "Заголовок — от 3 до 160 символов." }, { status: 400 });
  }
  if (text.length < 3 || text.length > 8000) {
    return NextResponse.json({ error: "Текст темы — от 3 до 8000 символов." }, { status: 400 });
  }

  const id = randomUUID();
  try {
    sqlite.transaction(() => {
      const source = discussionSource(sqlite, body ?? {});
      const recent = sqlite.prepare("SELECT count(*) n FROM forum_topics WHERE author_id=? AND datetime(created_at)>datetime('now','-1 hour')").get(user.id) as { n: number };
      if (recent.n >= 12) throw new Error("Слишком много новых тем. Продолжите разговор в существующей теме.");
      sqlite.prepare("INSERT INTO forum_topics(id,title,body,author_id,document_id,category,anchor_json) VALUES(?,?,?,?,?,?,?)").run(id, title, text, user.id, source.documentId, isForumCategory(body?.category) ? body.category : "general", source.anchorJson);
      bindDiscussionFiles(sqlite, user.id, body?.attachmentIds, "topic", id);
      if (body?.watch === true) sqlite.prepare("INSERT INTO forum_watches(user_id,topic_id) VALUES(?,?)").run(user.id, id);
    }).immediate();
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Не удалось открыть тему" }, { status: 400 }); }
  logActivity({ userId: user.id, email: user.email, action: "discuss.create", targetType: "topic", targetId: id });
  return NextResponse.json({ id });
}
