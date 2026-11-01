import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { forumAccess } from "@/lib/forum-access";
import { sqlite } from "@/lib/db/client";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(); const { id } = await context.params;
  const rights = await forumAccess(id, user);
  if (!rights.read || !rights.moderate) return NextResponse.json({ error: "Нет прав на управление темой" }, { status: 403 });
  const input = await request.json().catch(() => null);
  if (!input || Object.keys(input).some(key => !["locked", "pinned"].includes(key)) || Object.values(input).some(value => typeof value !== "boolean") || !Object.keys(input).length) return NextResponse.json({ error: "Некорректные настройки темы" }, { status: 400 });
  if (input.pinned !== undefined && user?.role !== "admin") return NextResponse.json({ error: "Закреплять темы может администратор" }, { status: 403 });
  sqlite.transaction(() => {
    if (input.locked !== undefined) sqlite.prepare("UPDATE forum_topics SET locked=? WHERE id=?").run(Number(input.locked), id);
    if (input.pinned !== undefined) sqlite.prepare("UPDATE forum_topics SET pinned=? WHERE id=?").run(Number(input.pinned), id);
  }).immediate();
  return NextResponse.json({ ok: true });
}
