import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getRoom, roomRights } from "@/lib/db/rooms";
import { featureDenied } from "@/lib/features";
import { sqlite } from "@/lib/db/client";
import { logActivity } from "@/lib/activity";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: "Войдите, чтобы присоединиться" }, { status: 401 });
  const disabled = await featureDenied("rooms", user); if (disabled) return disabled;
  const room = await getRoom((await context.params).id); if (!room) return NextResponse.json({ error: "Комната не найдена" }, { status: 404 });
  if (room.accessMode === "paid" || room.priceKopeks > 0) { const paidDisabled = await featureDenied("paid_events", user); if (paidDisabled) return paidDisabled; }
  const input = await request.json().catch(() => ({}));
  try {
    const joined = sqlite.transaction(() => {
      const rights = roomRights(room, user);
      if (rights.banned) throw new Error("Ведущий ограничил доступ к этой комнате");
      if (rights.member) return false;
      if (room.status !== "open") throw new Error("Запись в комнату закрыта");
      const validInvite = rights.mode === "invite" && typeof input.token === "string" && input.token.length <= 200 && room.inviteHash && createHash("sha256").update(input.token).digest("hex") === room.inviteHash;
      if (rights.mode !== "open" && !rights.invited && !validInvite) throw new Error(rights.mode === "paid" ? "Доступ к программе выдаёт ведущий. Автоматическая оплата пока не включена." : "Нужно приглашение ведущего");
      const taken = sqlite.prepare("SELECT count(*) n FROM users u WHERE u.id!=? AND (EXISTS(SELECT 1 FROM seminar_members m WHERE m.seminar_id=? AND m.user_id=u.id AND m.status='member') OR EXISTS(SELECT 1 FROM seminar_tickets t WHERE t.seminar_id=? AND t.user_id=u.id))").get(room.hostUserId ?? "", room.id, room.id) as { n: number };
      if (room.seatLimit && taken.n >= room.seatLimit) throw new Error("Все места заняты");
      sqlite.prepare("INSERT INTO seminar_members(seminar_id,user_id,status,joined_at) VALUES(?,?,'member',CURRENT_TIMESTAMP) ON CONFLICT(seminar_id,user_id) DO UPDATE SET status='member',joined_at=CURRENT_TIMESTAMP").run(room.id, user.id);
      return true;
    }).immediate();
    if (joined) logActivity({ userId: user.id, action: "room.join", targetType: "seminar", targetId: room.id });
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Не удалось присоединиться" }, { status: 403 }); }
}
