import { forumAccess } from "@/lib/forum-access";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db, sqlite } from "@/lib/db/client";
import { isWatching, setWatch } from "@/lib/db/forum";
import { forumTopics } from "@/lib/db/schema";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await context.params;
  const [topic] = await db.select({ id: forumTopics.id }).from(forumTopics).where(eq(forumTopics.id, id)).limit(1);
  if (!topic) return NextResponse.json({ error: "Тема не найдена" }, { status: 404 });
  if (!(await forumAccess(id, user)).read) return NextResponse.json({ error: "Нет доступа к обсуждению" }, { status: 403 });
  const watching = await isWatching(user.id, id);
  await setWatch(user.id, id, !watching);
  return NextResponse.json({ watching: !watching });
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(); const { id } = await context.params;
  if (!user || !(await forumAccess(id, user)).read) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  const input = await request.json().catch(() => null);
  if (!Number.isSafeInteger(input?.seen) || input.seen < 0) return NextResponse.json({ error: "Некорректная позиция" }, { status: 400 });
  const latest = sqlite.prepare("SELECT coalesce(max(rowid),0) seq FROM forum_posts WHERE topic_id=? AND rowid<=?").get(id, input.seen) as { seq: number };
  sqlite.prepare("UPDATE forum_watches SET last_read_seq=max(last_read_seq,?) WHERE user_id=? AND topic_id=?").run(latest.seq, user.id, id);
  return NextResponse.json({ ok: true });
}
