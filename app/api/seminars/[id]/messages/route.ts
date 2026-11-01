import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { roomContext } from "@/lib/room-api";
import { roomThread } from "@/lib/db/rooms";
import { sqlite } from "@/lib/db/client";
import { validateAnchor } from "@/lib/publication-content";
import { sanitizePlainText } from "@/lib/sanitize-text";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const loaded = await roomContext((await context.params).id); if (loaded.response) return loaded.response;
  const topic = roomThread(loaded.room); const url = new URL(request.url); const after = Math.max(0, Number(url.searchParams.get("after")) || 0); const before = Math.max(0, Number(url.searchParams.get("before")) || 0);
  const args: (string | number)[] = [topic]; let filter = "";
  if (after) { filter = "AND p.rowid>?"; args.push(after); } else if (before) { filter = "AND p.rowid<?"; args.push(before); }
  const rows = sqlite.prepare(`SELECT p.id,p.rowid AS seq,p.author_id AS authorId,u.name AS authorName,p.body,p.created_at AS createdAt,p.parent_id AS parentId,p.anchor_json AS anchorJson,p.message_kind AS kind,p.deleted_at AS deletedAt FROM forum_posts p JOIN users u ON u.id=p.author_id WHERE p.topic_id=? ${filter} ORDER BY p.rowid ${after ? "ASC" : "DESC"} LIMIT 100`).all(...args) as { id: string; seq: number; deletedAt: string | null; body: string; anchorJson: string | null }[];
  if (!after) rows.reverse();
  return NextResponse.json({ ok: true, messages: rows.map(row => row.deletedAt ? { ...row, body: "Сообщение удалено", anchorJson: null } : row), hasMore: rows.length === 100 }, { headers: { "Cache-Control": "private, no-store" } });
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const loaded = await roomContext((await context.params).id, "write"); if (loaded.response) return loaded.response;
  const user = loaded.user!;
  const recent = sqlite.prepare("SELECT count(*) n FROM forum_posts WHERE author_id=? AND datetime(created_at)>=datetime('now','-1 minute')").get(user.id) as { n: number };
  if (recent.n >= 20) return NextResponse.json({ error: "Слишком много сообщений. Подождите минуту и попробуйте снова." }, { status: 429 });
  try {
    const input = await request.json();
    if (typeof input.body !== "string" || input.body.trim().length < 1 || input.body.length > 8000) throw new Error("Сообщение: от 1 до 8000 символов");
    const kind = ["message", "question", "guidance", "note"].includes(input.kind) ? input.kind : "message";
    if (kind === "guidance" && !loaded.rights.host) return NextResponse.json({ error: "Указания публикует ведущий" }, { status: 403 });
    const anchor = input.anchor ? validateAnchor(input.anchor) : null;
    if (anchor && anchor.documentId !== loaded.room.documentId) throw new Error("Цитата должна относиться к книге этой комнаты");
    const topic = roomThread(loaded.room); const id = randomUUID();
    if (input.parentId && (typeof input.parentId !== "string" || !sqlite.prepare("SELECT id FROM forum_posts WHERE id=? AND topic_id=? AND deleted_at IS NULL").get(input.parentId, topic))) throw new Error("Исходное сообщение не найдено");
    sqlite.prepare("INSERT INTO forum_posts(id,topic_id,author_id,body,parent_id,anchor_json,message_kind) VALUES(?,?,?,?,?,?,?)").run(id, topic, user.id, sanitizePlainText(input.body, 8000), input.parentId || null, anchor ? JSON.stringify(anchor) : null, kind);
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Не удалось отправить" }, { status: 400 }); }
}
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const loaded = await roomContext((await context.params).id); if (loaded.response) return loaded.response;
  const input = await request.json().catch(() => null);
  const topic = roomThread(loaded.room);
  const post = typeof input?.id === "string" ? sqlite.prepare("SELECT author_id FROM forum_posts WHERE id=? AND topic_id=?").get(input.id, topic) as { author_id: string } | undefined : undefined;
  if (!post) return NextResponse.json({ error: "Сообщение не найдено" }, { status: 404 });
  if (post.author_id !== loaded.user?.id && !loaded.rights.manage) return NextResponse.json({ error: "Нет прав на удаление" }, { status: 403 });
  sqlite.prepare("UPDATE forum_posts SET deleted_at=CURRENT_TIMESTAMP WHERE id=?").run(input.id);
  return NextResponse.json({ ok: true });
}
