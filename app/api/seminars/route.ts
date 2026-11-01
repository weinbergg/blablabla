import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { featureDenied } from "@/lib/features";
import { sqlite } from "@/lib/db/client";
import { validateRoomInput, roomThread } from "@/lib/db/rooms";
import { slugify } from "@/lib/transliterate";
export async function POST(request: Request) {
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: "Войдите, чтобы открыть комнату" }, { status: 401 });
  const disabled = await featureDenied(["rooms", "room_creation"], user); if (disabled) return disabled;
  try {
    const input = await request.json(); const value = validateRoomInput(input);
    if (value.accessMode === "paid") { const paidDisabled = await featureDenied(["host_programs", "paid_events"], user); if (paidDisabled) return paidDisabled; }
    const id = randomUUID(); const slug = `${slugify(value.title).slice(0, 60)}-${id.slice(0, 8)}`;
    sqlite.transaction(() => {
      const count = sqlite.prepare("SELECT count(*) n FROM seminars WHERE host_user_id=? AND datetime(created_at)>datetime('now','-1 day')").get(user.id) as { n: number };
      if (count.n >= 10) throw new Error("Достигнут дневной лимит новых комнат");
      sqlite.prepare("INSERT INTO seminars(id,slug,title,summary,body,kind,document_id,host_user_id,starts_at,price_kopeks,discount_percent,seat_limit,status,access_mode,room_enabled,meet_url) VALUES(?,?,?,?,?,?,?,?,?,0,0,?,?,?,1,?)").run(id, slug, value.title, value.summary, value.body, value.kind, value.documentId, user.id, value.startsAt, value.seatLimit, value.status, value.accessMode, value.meetUrl);
      roomThread({ id, title: value.title, hostUserId: user.id, documentId: value.documentId });
      if (value.startsAt) sqlite.prepare("INSERT INTO seminar_meetings(id,seminar_id,title,starts_at) VALUES(?,?,?,?)").run(randomUUID(), id, "Первая встреча", value.startsAt);
    }).immediate();
    return NextResponse.json({ id, slug }, { status: 201 });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Не удалось создать комнату" }, { status: 400 }); }
}
