import { featureEnabled } from "@/lib/features";
import "server-only";

import { and, eq } from "drizzle-orm";
import { db, sqlite } from "@/lib/db/client";
import { channelModerators, channelPosts, channels, forumPosts, forumTopics, seminars } from "@/lib/db/schema";

import { roomAccess, type RoomAccessSource } from "@/lib/room-access";
import { channelPermissions } from "@/lib/channel-permissions";

type Viewer = { id: string; role: string } | null;
type Attachment = { ownerId: string; parentId: string | null; parentType: string | null };

/** A binding is not an access grant: follow the publication's visibility and
 * editing permissions before serving bytes or changing its shared marks. */
export async function attachmentAccess(row: Attachment, user: Viewer) {
  const ownsFile = user?.id === row.ownerId;
  const admin = user?.role === "admin";
  if (!row.parentId) return { canRead: ownsFile, canEdit: ownsFile };

  const section = row.parentType === "channel_post" || row.parentType === "channel" ? "channels" : row.parentType === "seminar" ? "rooms" : null;
  if (section && !(await featureEnabled(section, user))) return { canRead: false, canEdit: false };
  let canRead = false;
  let managesParent = false;
  if (row.parentType === "channel_post") {
    const [parent] = await db.select({
      published: channelPosts.published,
      deletedAt: channelPosts.deletedAt,
      kind: channels.kind,
      archived: channels.archived,
      ownerId: channels.ownerId,
      channelId: channels.id,
    }).from(channelPosts).innerJoin(channels, eq(channels.id, channelPosts.channelId))
      .where(eq(channelPosts.id, row.parentId)).limit(1);
    if (!parent || parent.deletedAt) return { canRead: false, canEdit: false };
    const [delegated] = user ? await db.select()
      .from(channelModerators)
      .where(and(eq(channelModerators.channelId, parent.channelId), eq(channelModerators.userId, user.id)))
      .limit(1) : [];
    const rights = channelPermissions(parent, user, delegated);
    canRead = rights.readDrafts || Boolean(parent.published && !parent.archived);
    return { canRead, canEdit: canRead && rights.publish };
  } else if (row.parentType === "channel") {
    const [channel] = await db.select().from(channels).where(eq(channels.id, row.parentId)).limit(1);
    if (!channel) return { canRead: false, canEdit: false };
    const [member] = user ? await db.select().from(channelModerators).where(and(eq(channelModerators.channelId, channel.id), eq(channelModerators.userId, user.id))).limit(1) : [];
    const rights = channelPermissions(channel, user, member);
    return { canRead: !channel.archived || rights.settings, canEdit: rights.settings };
  } else if (row.parentType === "topic" || row.parentType === "post") {
    const topic = row.parentType === "topic"
      ? sqlite.prepare("SELECT seminar_id FROM forum_topics WHERE id=?").get(row.parentId)
      : sqlite.prepare("SELECT t.seminar_id FROM forum_posts p JOIN forum_topics t ON t.id=p.topic_id WHERE p.id=? AND p.deleted_at IS NULL").get(row.parentId);
    if (!topic) return { canRead: false, canEdit: false };
    const seminarId = (topic as { seminar_id: string | null } | undefined)?.seminar_id;
    if (!(await featureEnabled(seminarId ? "rooms" : "forum", user))) return { canRead: false, canEdit: false };
    if (seminarId) {
      const room = sqlite.prepare("SELECT id,host_user_id AS hostUserId,status,access_mode AS accessMode,price_kopeks AS priceKopeks,discussion_locked AS discussionLocked FROM seminars WHERE id=?").get(seminarId) as RoomAccessSource | undefined;
      if (!room) return { canRead: false, canEdit: false };
    if ((room.accessMode === "paid" || room.priceKopeks > 0) && !(await featureEnabled("paid_events", user))) return { canRead: false, canEdit: false };
      const rights = roomAccess(sqlite, room, user);
      return { canRead: rights.read, canEdit: rights.read && (rights.manage || (ownsFile && rights.write)) };
    }
    const table = row.parentType === "topic" ? forumTopics : forumPosts;
    const [parent] = await db.select({ authorId: table.authorId }).from(table)
      .where(eq(table.id, row.parentId)).limit(1);
    canRead = Boolean(parent);
    managesParent = Boolean(parent && user && (admin || parent.authorId === user.id));
  } else if (row.parentType === "seminar") {
    const [parent] = await db.select().from(seminars).where(eq(seminars.id, row.parentId)).limit(1);
    if (!parent) return { canRead: false, canEdit: false };
    if ((parent.accessMode === "paid" || parent.priceKopeks > 0) && !(await featureEnabled("paid_events", user))) return { canRead: false, canEdit: false };
    const rights = roomAccess(sqlite, parent, user);
    return { canRead: rights.read, canEdit: rights.host };

  }
  return { canRead, canEdit: canRead && (ownsFile || managesParent) };
}
