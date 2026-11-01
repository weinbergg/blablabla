import { randomBytes, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { roomContext } from "@/lib/room-api";
import { sqlite } from "@/lib/db/client";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const loaded = await roomContext((await context.params).id, "host"); if (loaded.response) return loaded.response;
  const input = await request.json().catch(() => null);
  if (input?.action === "invite-link") {
    if (loaded.rights.mode !== "invite") return NextResponse.json({ error: "Ссылка доступна для комнат по приглашению" }, { status: 400 });
    const token = randomBytes(32).toString("base64url"); sqlite.prepare("UPDATE seminars SET invite_hash=? WHERE id=?").run(createHash("sha256").update(token).digest("hex"), loaded.room.id);
    return NextResponse.json({ ok: true, path: `/seminars/${loaded.room.slug}?invite=${token}` });
  }
  if (!input || !["invite", "grant", "ban", "moderator", "member"].includes(input.action)) return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
  const found = typeof input.userId === "string" ? sqlite.prepare("SELECT id,name FROM users WHERE id=?").all(input.userId) : typeof input.name === "string" ? sqlite.prepare("SELECT id,name FROM users WHERE name=? LIMIT 2").all(input.name.trim()) : [];
  if (found.length !== 1) return NextResponse.json({ error: "Укажите точное имя единственного пользователя или его профиль" }, { status: 400 });
  const person = found[0] as { id: string; name: string };
  if (person.id === loaded.room.hostUserId) return NextResponse.json({ error: "Права ведущего менять нельзя" }, { status: 403 });
  const status = input.action === "invite" ? "invited" : input.action === "ban" ? "banned" : "member";
  const role = input.action === "moderator" ? "moderator" : "member";
  sqlite.prepare("INSERT INTO seminar_members(seminar_id,user_id,role,status,invited_by,joined_at) VALUES(?,?,?,?,?,?) ON CONFLICT(seminar_id,user_id) DO UPDATE SET role=excluded.role,status=excluded.status,invited_by=excluded.invited_by,joined_at=excluded.joined_at").run(loaded.room.id, person.id, role, status, loaded.user!.id, status === "member" ? new Date().toISOString() : null);
  return NextResponse.json({ ok: true, userId: person.id, name: person.name, status, role });
}
