import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, sqlite } from "./client";
import { documents, seminars, users } from "./schema";
import { roomAccess } from "@/lib/room-access";
import { ROOM_FORMATS } from "@/lib/room-types";
import { safeHref } from "@/lib/publication-content";

export async function getRoom(id: string, bySlug = false) {
  const [row] = await db.select({ room: seminars, documentTitle: documents.title, documentType: documents.fileType, language: documents.language, hostName: users.name })
    .from(seminars).leftJoin(documents, eq(documents.id, seminars.documentId)).leftJoin(users, eq(users.id, seminars.hostUserId))
    .where(bySlug ? eq(seminars.slug, id) : eq(seminars.id, id)).limit(1);
  return row ? { ...row.room, documentTitle: row.documentTitle, documentType: row.documentType, language: row.language, hostName: row.hostName } : null;
}
export type ReadingRoom = NonNullable<Awaited<ReturnType<typeof getRoom>>>;
export function roomRights(room: ReadingRoom, user: { id: string; role: string } | null) { return roomAccess(sqlite, room, user); }
export function roomThread(room: { id: string; title: string; hostUserId: string | null; documentId: string | null }) {
  return sqlite.transaction(() => {
    const existing = sqlite.prepare("SELECT id FROM forum_topics WHERE seminar_id=? ORDER BY created_at LIMIT 1").get(room.id) as { id: string } | undefined;
    if (existing) return existing.id;
    if (!room.hostUserId) throw new Error("У комнаты не назначен ведущий");
    const id = randomUUID();
    sqlite.prepare("INSERT INTO forum_topics(id,title,body,author_id,document_id,seminar_id,category) VALUES(?,?,?,?,?,?,'seminars')").run(id, room.title, "Обсуждение читательской комнаты", room.hostUserId, room.documentId, room.id);
    return id;
  }).immediate();
}
export function roomPeople(roomId: string, includeInvited = false) {
  return sqlite.prepare(`SELECT u.id,u.name,COALESCE(m.role,'member') AS role,COALESCE(m.status,'member') AS status,m.joined_at AS joinedAt
    FROM users u LEFT JOIN seminar_members m ON m.user_id=u.id AND m.seminar_id=?
    WHERE (m.status IN (${includeInvited ? "'member','invited','banned'" : "'member'"}) OR (m.status IS NULL AND EXISTS(SELECT 1 FROM seminar_tickets t WHERE t.seminar_id=? AND t.user_id=u.id))) ORDER BY u.name`).all(roomId, roomId) as { id: string; name: string; role: string; status: string; joinedAt: string | null }[];
}
export function roomMeetings(roomId: string) { return sqlite.prepare("SELECT id,title,starts_at AS startsAt,ends_at AS endsAt,notes,status FROM seminar_meetings WHERE seminar_id=? ORDER BY datetime(starts_at)").all(roomId) as { id: string; title: string; startsAt: string; endsAt: string | null; notes: string; status: string }[]; }

export function validateRoomInput(input: Record<string, unknown>) {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const summary = typeof input.summary === "string" ? input.summary.trim() : "";
  const body = typeof input.body === "string" ? input.body.trim() : "";
  if (title.length < 3 || title.length > 160 || summary.length > 1200 || body.length > 20000) throw new Error("Название: 3–160 символов, описание: до 1200, программа: до 20 000");
  const kind = ROOM_FORMATS.find(f => f.id === input.kind)?.id; if (!kind) throw new Error("Выберите формат встречи");
  const accessMode = ["open", "invite", "closed", "paid"].includes(String(input.accessMode)) ? String(input.accessMode) : null; if (!accessMode) throw new Error("Выберите режим доступа");
  const documentId = typeof input.documentId === "string" ? input.documentId : null;
  if (documentId && !sqlite.prepare("SELECT id FROM documents WHERE id=?").get(documentId)) throw new Error("Книга не найдена");
  const startsAt = input.startsAt ? new Date(String(input.startsAt)) : null; if (startsAt && !Number.isFinite(startsAt.getTime())) throw new Error("Некорректное время встречи");
  const seatLimit = input.seatLimit == null || input.seatLimit === "" ? null : Number(input.seatLimit);
  if (seatLimit !== null && (!Number.isInteger(seatLimit) || seatLimit < 1 || seatLimit > 10000)) throw new Error("Укажите от 1 до 10 000 мест");
  const meetUrl = input.meetUrl ? safeHref(input.meetUrl) : null; if (input.meetUrl && (!meetUrl || !meetUrl.startsWith("https://"))) throw new Error("Ссылка на видеовстречу должна начинаться с https://");
  const status = ["draft", "open", "closed", "done"].includes(String(input.status)) ? String(input.status) : "draft";
  return { title, summary, body, kind, accessMode, documentId, startsAt: startsAt?.toISOString() ?? null, seatLimit, meetUrl, status };
}
