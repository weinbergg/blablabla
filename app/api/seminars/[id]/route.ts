import { featureDenied } from "@/lib/features";
import { NextResponse } from "next/server";
import { roomContext } from "@/lib/room-api";
import { roomMeetings, roomPeople, validateRoomInput } from "@/lib/db/rooms";
import { sqlite } from "@/lib/db/client";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const loaded = await roomContext((await context.params).id); if (loaded.response) return loaded.response;
  const room = { ...loaded.room, inviteHash: undefined };
  return NextResponse.json({ ok: true, room, rights: loaded.rights, people: roomPeople(room.id, loaded.rights.manage), meetings: roomMeetings(room.id) }, { headers: { "Cache-Control": "private, no-store" } });
}
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const loaded = await roomContext((await context.params).id, "host"); if (loaded.response) return loaded.response;
  try {
    const input = await request.json();
    if (typeof input.discussionLocked === "boolean" && Object.keys(input).length === 1) {
      sqlite.prepare("UPDATE seminars SET discussion_locked=? WHERE id=?").run(Number(input.discussionLocked), loaded.room.id);
    } else {
      const value = validateRoomInput(input);
    if (value.accessMode === "paid") { const paidDisabled = await featureDenied(["host_programs", "paid_events"], loaded.user); if (paidDisabled) return paidDisabled; }
      if (!loaded.room.roomEnabled && loaded.room.priceKopeks > 0 && value.accessMode !== loaded.rights.mode) throw new Error("Режим доступа существующего платного мероприятия меняется только после отдельного согласования");
      sqlite.transaction(() => {
        sqlite.prepare("UPDATE seminars SET title=?,summary=?,body=?,kind=?,document_id=?,starts_at=?,seat_limit=?,status=?,access_mode=?,meet_url=?,reading_state=CASE WHEN document_id IS ? THEN reading_state ELSE NULL END WHERE id=?").run(value.title, value.summary, value.body, value.kind, value.documentId, value.startsAt, value.seatLimit, value.status, value.accessMode, value.meetUrl, value.documentId, loaded.room.id);
        sqlite.prepare("UPDATE forum_topics SET title=?,document_id=? WHERE seminar_id=?").run(value.title, value.documentId, loaded.room.id);
      }).immediate();
    }
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Не удалось сохранить комнату" }, { status: 400 }); }
}
