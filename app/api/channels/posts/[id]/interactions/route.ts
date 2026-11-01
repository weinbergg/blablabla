import { featureDenied, featureEnabled } from "@/lib/features";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { sqlite } from "@/lib/db/client";
function visible(id: string) { return sqlite.prepare("SELECT p.id FROM channel_posts p JOIN channels c ON c.id=p.channel_id WHERE p.id=? AND p.published=1 AND p.deleted_at IS NULL AND c.archived=0").get(id); }
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const featureBlock = await featureDenied(["channels"]); if (featureBlock) return featureBlock;
  const { id } = await context.params;
  if (!visible(id)) return NextResponse.json({ error: "Публикация недоступна" }, { status: 404 });
  const comments = !(await featureEnabled("comments")) ? [] : sqlite.prepare("SELECT c.id,c.post_id AS postId,c.author_id AS authorId,u.name AS authorName,c.body,c.created_at AS createdAt,c.parent_id AS parentId FROM channel_comments c JOIN users u ON u.id=c.author_id WHERE c.post_id=? ORDER BY datetime(c.created_at),c.id LIMIT 300").all(id);
  return NextResponse.json({ comments }, { headers: { "Cache-Control": "private, no-store" } });
}
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const featureBlock = await featureDenied(["channels"]); if (featureBlock) return featureBlock;
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: "Войдите, чтобы сохранить публикацию или оставить реакцию" }, { status: 401 });
  const { id } = await context.params; if (!visible(id)) return NextResponse.json({ error: "Публикация недоступна" }, { status: 404 });
  const input = await request.json().catch(() => null);
  if (!input || !["save", "like"].includes(input.action) || typeof input.active !== "boolean") return NextResponse.json({ error: "Некорректное действие" }, { status: 400 });
  if (input.action === "save") {
    if (input.active) sqlite.prepare("INSERT INTO channel_post_saves(post_id,user_id) VALUES(?,?) ON CONFLICT DO NOTHING").run(id, user.id);
    else sqlite.prepare("DELETE FROM channel_post_saves WHERE post_id=? AND user_id=?").run(id, user.id);
  } else {
    if (input.active) sqlite.prepare("INSERT INTO channel_post_reactions(post_id,user_id,emoji) VALUES(?,?,'heart') ON CONFLICT DO NOTHING").run(id, user.id);
    else sqlite.prepare("DELETE FROM channel_post_reactions WHERE post_id=? AND user_id=? AND emoji='heart'").run(id, user.id);
  }
  const count = (sqlite.prepare("SELECT count(*) AS n FROM channel_post_reactions WHERE post_id=?").get(id) as { n: number }).n;
  return NextResponse.json({ ok: true, active: input.active, count });
}
