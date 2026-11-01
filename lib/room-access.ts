import type Database from "better-sqlite3";
export type RoomAccessSource = { id: string; hostUserId: string | null; status: string; accessMode: string; priceKopeks: number; discussionLocked: number };
export type RoomRights = { host: boolean; manage: boolean; invited: boolean; member: boolean; read: boolean; preview: boolean; write: boolean; banned: boolean; mode: string };

export function roomAccess(db: Database.Database, room: RoomAccessSource, user: { id: string; role: string } | null): RoomRights {
  const mode = room.accessMode === "legacy" ? room.priceKopeks > 0 ? "paid" : "open" : room.accessMode;
  const host = !!user && (user.id === room.hostUserId || user.role === "admin");
  const membership = user ? db.prepare("SELECT role,status FROM seminar_members WHERE seminar_id=? AND user_id=?").get(room.id, user.id) as { role: string; status: string } | undefined : undefined;
  const banned = !host && membership?.status === "banned";
  const ticket = !!user && !!db.prepare("SELECT 1 FROM seminar_tickets WHERE seminar_id=? AND user_id=?").get(room.id, user.id);
  const member = !banned && (host || membership?.status === "member" || ticket);
  const manage = !banned && (host || (member && membership?.role === "moderator"));
  const invited = !banned && membership?.status === "invited";
  const read = !banned && (host || (room.status !== "draft" && member));
  return { mode, host, manage, invited, member, banned, read,
    preview: !banned && (host || member || (room.status !== "draft" && (mode === "open" || mode === "paid" || invited))),
    write: read && room.status !== "done" && (manage || room.discussionLocked === 0),
  };
}
