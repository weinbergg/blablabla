import "server-only";
import { sqlite } from "./client";
export function hostOverview(userId: string, page = 1) {
  const active = "u.id!=s.host_user_id AND NOT EXISTS(SELECT 1 FROM seminar_members b WHERE b.seminar_id=s.id AND b.user_id=u.id AND b.status='banned') AND (EXISTS(SELECT 1 FROM seminar_members m WHERE m.seminar_id=s.id AND m.user_id=u.id AND m.status='member') OR EXISTS(SELECT 1 FROM seminar_tickets t WHERE t.seminar_id=s.id AND t.user_id=u.id))";
  const totals = sqlite.prepare("SELECT count(*) total,coalesce(sum(status='open'),0) open FROM seminars WHERE host_user_id=?").get(userId) as { total: number; open: number };
  const audience = (sqlite.prepare(`SELECT count(distinct u.id) n FROM seminars s JOIN users u ON ${active} WHERE s.host_user_id=?`).get(userId) as { n: number }).n;
  const invited = (sqlite.prepare("SELECT count(*) n FROM seminar_members m JOIN seminars s ON s.id=m.seminar_id WHERE s.host_user_id=? AND m.status='invited'").get(userId) as { n: number }).n;
  const rooms = sqlite.prepare(`SELECT s.id,s.slug,s.title,s.kind,s.status,s.access_mode AS accessMode,s.starts_at AS startsAt,(SELECT count(*) FROM users u WHERE ${active}) participants,(SELECT count(*) FROM seminar_members m WHERE m.seminar_id=s.id AND m.status='invited') invited FROM seminars s WHERE s.host_user_id=? ORDER BY datetime(s.created_at) DESC,s.id LIMIT 20 OFFSET ?`).all(userId, (Math.max(1, page) - 1) * 20) as { id: string; slug: string; title: string; kind: string; status: string; accessMode: string; startsAt: string | null; participants: number; invited: number }[];
  const people = sqlite.prepare(`SELECT u.id,u.name,count(distinct s.id) rooms FROM seminars s JOIN users u ON ${active} WHERE s.host_user_id=? GROUP BY u.id ORDER BY u.name LIMIT 100`).all(userId) as { id: string; name: string; rooms: number }[];
  return { ...totals, audience, invited, rooms, people };
}
