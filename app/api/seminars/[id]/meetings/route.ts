import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { roomContext } from "@/lib/room-api";
import { sqlite } from "@/lib/db/client";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const loaded = await roomContext((await context.params).id, "host"); if (loaded.response) return loaded.response;
  const input = await request.json().catch(() => null);
  const starts = new Date(input?.startsAt ?? "");
  if (typeof input?.title !== "string" || !input.title.trim() || input.title.length > 160 || !Number.isFinite(starts.getTime()) || (input.notes && (typeof input.notes !== "string" || input.notes.length > 8000))) return NextResponse.json({ error: "Укажите название и дату встречи" }, { status: 400 });
  const status = ["scheduled", "done", "cancelled"].includes(input.status) ? input.status : "scheduled";
  if (input.id) {
    const result = sqlite.prepare("UPDATE seminar_meetings SET title=?,starts_at=?,notes=?,status=? WHERE id=? AND seminar_id=?").run(input.title.trim(), starts.toISOString(), input.notes || "", status, input.id, loaded.room.id);
    if (!result.changes) return NextResponse.json({ error: "Встреча не найдена" }, { status: 404 });
    return NextResponse.json({ ok: true, id: input.id });
  }
  const id = randomUUID(); sqlite.prepare("INSERT INTO seminar_meetings(id,seminar_id,title,starts_at,notes,status) VALUES(?,?,?,?,?,?)").run(id, loaded.room.id, input.title.trim(), starts.toISOString(), input.notes || "", status);
  return NextResponse.json({ id }, { status: 201 });
}
