import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser } from "./auth";
import { featureDenied } from "./features";
import { getRoom, roomRights } from "./db/rooms";

export async function roomContext(id: string, scope: "preview" | "read" | "write" | "manage" | "host" = "read") {
  const user = await getCurrentUser();
  const disabled = await featureDenied("rooms", user); if (disabled) return { response: disabled } as const;
  const room = await getRoom(id); if (!room) return { response: NextResponse.json({ error: "Комната не найдена" }, { status: 404 }) } as const;
  if (room.accessMode === "paid" || room.priceKopeks > 0) { const paidDisabled = await featureDenied("paid_events", user); if (paidDisabled) return { response: paidDisabled } as const; }
  const rights = roomRights(room, user);
  if (!rights[scope]) return { response: NextResponse.json({ error: scope === "read" ? "Вступите в комнату или получите приглашение ведущего" : "Нет доступа к этой операции" }, { status: user ? 403 : 401 }) } as const;
  return { room, user, rights } as const;
}
