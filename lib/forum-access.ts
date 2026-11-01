import { featureEnabled } from "@/lib/features";
import "server-only";
import { sqlite } from "@/lib/db/client";
import { getRoom, roomRights } from "@/lib/db/rooms";
export async function forumAccess(topicId: string, user: { id: string; role: string } | null) {
  const topic = sqlite.prepare("SELECT seminar_id,author_id,locked FROM forum_topics WHERE id=?").get(topicId) as { seminar_id: string | null; author_id: string; locked: number } | undefined;
  if (!topic) return { read: false, write: false, moderate: false };
  if (!(await featureEnabled(topic.seminar_id ? "rooms" : "forum", user))) return { read: false, write: false, moderate: false };
  if (topic.seminar_id) {
    const room = await getRoom(topic.seminar_id); if (!room) return { read: false, write: false, moderate: false };
    if ((room.accessMode === "paid" || room.priceKopeks > 0) && !(await featureEnabled("paid_events", user))) return { read: false, write: false, moderate: false };
    const rights = roomRights(room, user);
    return { read: rights.read, write: rights.write && !topic.locked, moderate: rights.manage };
  }
  return { read: true, write: !!user && !topic.locked && await featureEnabled("comments", user), moderate: user?.role === "admin" || user?.id === topic.author_id };
}
