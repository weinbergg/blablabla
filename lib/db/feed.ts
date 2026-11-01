import "server-only";
import { sqlite } from "./client";
import { getChannelPermissions } from "./channels";
import type { ChannelPermissions } from "@/lib/channel-permissions";
import { parseContent } from "@/lib/publication-content";
import { publicRoomLink } from "@/lib/publication-links";
import { featureEnabled } from "@/lib/features";

export type PublicationItem = {
  id: string; slug: string; title: string; body: string; contentJson: string | null; revision: number;
  pinned: number; published: number; commentsOpen: number; createdAt: string;
  authorId: string; authorName: string; channelId: string; channelSlug: string; channelTitle: string;
  channelKind: string; channelAvatar: string | null; ownerId: string; archived: number;
  documentId: string | null; documentTitle: string | null;
  commentCount: number; reactionCount: number; saved: boolean; liked: boolean; rights: ChannelPermissions;
};
export async function publicationFeed(user: { id: string; role: string } | null, options: { channelId?: string; postId?: string; mode?: string; q?: string; page?: number; drafts?: boolean } = {}) {
  const args: (string | number)[] = [user?.id ?? "", user?.id ?? ""];
  const where = ["p.deleted_at IS NULL", "c.archived=0"];
  if (options.channelId) { where.push("c.id=?"); args.push(options.channelId); }
  if (options.postId) { where.push("p.id=?"); args.push(options.postId); }
  // Draft visibility is derived from the same membership policy as mutations.
  if (options.drafts || options.postId) {
    where.push("(p.published=1 OR c.owner_id=? OR ?='admin' OR (c.kind!='news' AND EXISTS(SELECT 1 FROM channel_moderators cm WHERE cm.channel_id=c.id AND cm.user_id=? AND cm.role IN ('admin','editor'))))");
    args.push(user?.id ?? "", user?.role ?? "", user?.id ?? "");
    if (options.drafts) where.push("p.published=0");
  } else where.push("p.published=1");
  if (options.mode === "following") { where.push("EXISTS(SELECT 1 FROM channel_follows f WHERE f.channel_id=c.id AND f.user_id=?)"); args.push(user?.id ?? ""); }
  if (options.mode === "saved") { where.push("EXISTS(SELECT 1 FROM channel_post_saves s WHERE s.post_id=p.id AND s.user_id=?)"); args.push(user?.id ?? ""); }
  if (options.mode === "popular") where.push("datetime(p.created_at) >= datetime('now','-30 days')");
  if (options.q?.trim()) { where.push("(p.title LIKE ? OR p.body LIKE ? OR c.title LIKE ?)"); const q = `%${options.q.trim().slice(0, 80)}%`; args.push(q, q, q); }
  const page = Math.min(10000, Math.max(1, Math.floor(options.page || 1))); const limit = options.postId ? 1 : 20;
  const rows = sqlite.prepare(`SELECT p.id,p.slug,p.title,p.body,p.content_json AS contentJson,p.revision,p.pinned,p.published,p.comments_open AS commentsOpen,p.created_at AS createdAt,
    p.author_id AS authorId,u.name AS authorName,c.id AS channelId,c.slug AS channelSlug,c.title AS channelTitle,c.kind AS channelKind,c.avatar_attachment_id AS channelAvatar,c.owner_id AS ownerId,c.archived,
    p.document_id AS documentId,d.title AS documentTitle,
    (SELECT count(*) FROM channel_comments x WHERE x.post_id=p.id) AS commentCount,
    (SELECT count(*) FROM channel_post_reactions r WHERE r.post_id=p.id) AS reactionCount,
    EXISTS(SELECT 1 FROM channel_post_saves s WHERE s.post_id=p.id AND s.user_id=?) AS saved,
    EXISTS(SELECT 1 FROM channel_post_reactions r WHERE r.post_id=p.id AND r.user_id=? AND r.emoji='heart') AS liked
    FROM channel_posts p JOIN channels c ON c.id=p.channel_id JOIN users u ON u.id=p.author_id LEFT JOIN documents d ON d.id=p.document_id
    WHERE ${where.join(" AND ")} ORDER BY ${options.mode === "popular" ? "(reactionCount+commentCount*2) DESC," : options.channelId ? "p.pinned DESC," : ""} datetime(p.created_at) DESC,p.id DESC LIMIT ? OFFSET ?`).all(...args, limit + 1, (page - 1) * limit) as Omit<PublicationItem, "rights">[];
  const permissions = new Map<string, ChannelPermissions>();
  const [roomsEnabled, paidEnabled] = await Promise.all([featureEnabled("rooms", user), featureEnabled("paid_events", user)]);
  const posts: PublicationItem[] = [];
  for (const row of rows.slice(0, limit)) {
    const content = parseContent(row.contentJson);
    if (content) {
      for (const block of content.blocks) {
        if (block.type === "book" || block.type === "quote") {
          const book = sqlite.prepare("SELECT file_type AS format,language FROM documents WHERE id=?").get(block.type === "book" ? block.documentId : block.anchor.documentId) as { format: string; language: string } | undefined;
          if (book) { block.format = book.format?.toLowerCase(); if (block.type === "book") block.language = book.language; }
        }
        if (block.type === "file") {
          delete block.size; delete block.mime;
          const file = sqlite.prepare("SELECT size,mime FROM community_attachments WHERE id=? AND parent_type='channel_post' AND parent_id=?").get(block.fileId, row.id) as { size: number; mime: string } | undefined;
          if (file) { block.size = file.size; block.mime = file.mime; }
        }
      }
      for (const block of content.blocks) if (block.type === "link") { delete block.event; if (roomsEnabled) block.event = publicRoomLink(sqlite, block.href, paidEnabled) ?? undefined; }
      row.contentJson = JSON.stringify(content);
    }
    if (!permissions.has(row.channelId)) permissions.set(row.channelId, await getChannelPermissions({ id: row.channelId, kind: row.channelKind, ownerId: row.ownerId, archived: row.archived }, user));
    posts.push({ ...row, saved: Boolean(row.saved), liked: Boolean(row.liked), rights: permissions.get(row.channelId)! });
  }
  return { posts, hasMore: rows.length > limit, page };
}

export function channelAudience(channelId: string, userId?: string) {
  const count = (sqlite.prepare("SELECT count(*) AS n FROM channel_follows WHERE channel_id=?").get(channelId) as { n: number }).n;
  const following = !!userId && !!sqlite.prepare("SELECT 1 FROM channel_follows WHERE channel_id=? AND user_id=?").get(channelId, userId);
  return { count, following };
}
