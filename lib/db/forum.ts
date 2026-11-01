import { featureEnabled } from "@/lib/features";
import { and, desc, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import { db, sqlite } from "./client";
import { getRoom, roomRights } from "./rooms";
import { communityAttachments, documents, forumPosts, forumReactions, forumTopics, forumWatches, seminars, users } from "./schema";
import { isForumCategory, type ForumCategory } from "@/lib/forum-meta";
import { listAttachments } from "@/lib/community-files";
import { isReactionKey, type ReactionCount, type ReactionKey } from "@/lib/reactions";

export async function listForumTopics(options: {
  limit?: number;
  offset?: number;
  watchingUserId?: string;
  viewerId?: string;
  q?: string;
  category?: string;
  sort?: "new" | "active";
} = {}) {
  const limit = Math.min(80, Math.max(1, options.limit ?? 40));
  const filters = [isNull(forumTopics.seminarId)];
  if (options.q?.trim()) {
    const needle = `%${options.q.trim().slice(0, 80)}%`;
    filters.push(or(like(forumTopics.title, needle), like(forumTopics.body, needle))!);
  }
  if (options.category && isForumCategory(options.category)) {
    filters.push(eq(forumTopics.category, options.category));
  }
  if (options.watchingUserId) filters.push(sql`exists(select 1 from forum_watches w where w.topic_id=${forumTopics.id} and w.user_id=${options.watchingUserId})`);
  const where = filters.length ? and(...filters) : undefined;

  const rows = await db
    .select({
      unread: sql<number>`(select count(*) from forum_posts p join forum_watches w on w.topic_id=p.topic_id where w.user_id=${options.viewerId ?? ""} and p.topic_id=${forumTopics.id} and p.rowid>w.last_read_seq and p.author_id!=w.user_id and p.deleted_at is null)`,
      id: forumTopics.id,
      title: forumTopics.title,
      body: forumTopics.body,
      createdAt: forumTopics.createdAt,
      locked: forumTopics.locked,
      pinned: forumTopics.pinned,
      category: forumTopics.category,
      authorId: forumTopics.authorId,
      authorName: users.name,
      authorRole: users.role,
      authorAvatarKey: users.avatarKey,
      authorAvatarColor: users.avatarColor,
      documentId: forumTopics.documentId,
      documentTitle: documents.title,
      seminarId: forumTopics.seminarId,
      seminarTitle: seminars.title,
      seminarSlug: seminars.slug,
      replyCount: sql<number>`(select count(*) from forum_posts where topic_id = ${forumTopics.id} and deleted_at is null)`,
      lastAt: sql<string>`coalesce((select max(created_at) from forum_posts where topic_id = ${forumTopics.id} and deleted_at is null), ${forumTopics.createdAt})`,
      lastExcerpt: sql<string>`coalesce((select body from forum_posts where topic_id = ${forumTopics.id} and deleted_at is null order by rowid desc limit 1), ${forumTopics.body})`,
    })
    .from(forumTopics)
    .innerJoin(users, eq(forumTopics.authorId, users.id))
    .leftJoin(documents, eq(forumTopics.documentId, documents.id))
    .leftJoin(seminars, eq(forumTopics.seminarId, seminars.id))
    .where(where)
    .orderBy(
      desc(forumTopics.pinned),
      options.sort === "active"
        ? desc(sql`(select max(created_at) from forum_posts where topic_id = ${forumTopics.id} and deleted_at is null)`)
        : desc(forumTopics.createdAt),
    )
    .limit(limit).offset(Math.max(0, Math.floor(options.offset ?? 0)));
  return rows;
}

export const FORUM_PAGE_SIZE = 20;
export async function getForumTopic(id: string, viewerId?: string | null, options: { page?: number; post?: string } = {}) {
  const [topic] = await db
    .select({
      anchorJson: forumTopics.anchorJson,
      id: forumTopics.id,
      title: forumTopics.title,
      body: forumTopics.body,
      createdAt: forumTopics.createdAt,
      locked: forumTopics.locked,
      pinned: forumTopics.pinned,
      category: forumTopics.category,
      authorId: forumTopics.authorId,
      authorName: users.name,
      authorRole: users.role,
      authorAvatarKey: users.avatarKey,
      authorAvatarColor: users.avatarColor,
      documentId: forumTopics.documentId,
      documentTitle: documents.title,
      seminarId: forumTopics.seminarId,
      seminarTitle: seminars.title,
      seminarSlug: seminars.slug,
    })
    .from(forumTopics)
    .innerJoin(users, eq(forumTopics.authorId, users.id))
    .leftJoin(documents, eq(forumTopics.documentId, documents.id))
    .leftJoin(seminars, eq(forumTopics.seminarId, seminars.id))
    .where(eq(forumTopics.id, id))
    .limit(1);
  if (!topic) return null;
  const [viewer] = viewerId ? await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, viewerId)).limit(1) : [];
  if (!(await featureEnabled(topic.seminarId ? "rooms" : "forum", viewer ?? null))) return null;
  if (topic.seminarId) {
    const room = await getRoom(topic.seminarId);
    const [viewer] = viewerId ? await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, viewerId)).limit(1) : [];
    if (!room || !roomRights(room, viewer ?? null).read) return null;
  }

  const total = (sqlite.prepare("SELECT count(*) n FROM forum_posts WHERE topic_id=?").get(id) as { n: number }).n;
  const pages = Math.max(1, Math.ceil(total / FORUM_PAGE_SIZE));
  let page = Math.max(1, Math.min(pages, Math.floor(options.page || 1)));
  if (options.post) {
    const target = sqlite.prepare("SELECT rowid AS seq FROM forum_posts WHERE id=? AND topic_id=?").get(options.post, id) as { seq: number } | undefined;
    if (target) page = Math.floor((sqlite.prepare("SELECT count(*) n FROM forum_posts WHERE topic_id=? AND rowid<?").get(id, target.seq) as { n: number }).n / FORUM_PAGE_SIZE) + 1;
  }
  const posts = await db
    .select({
      seq: sql<number>`forum_posts.rowid`,
      anchorJson: forumPosts.anchorJson,
      documentId: forumPosts.documentId,
      documentTitle: documents.title,
      deletedAt: forumPosts.deletedAt,
      parentExcerpt: sql<string | null>`(select case when parent.deleted_at is null then substr(parent.body,1,300) else 'Сообщение удалено' end from forum_posts parent where parent.id=${forumPosts.parentId} and parent.topic_id=${forumPosts.topicId})`,
      id: forumPosts.id,
      parentId: forumPosts.parentId,
      body: forumPosts.body,
      createdAt: forumPosts.createdAt,
      updatedAt: forumPosts.updatedAt,
      authorId: forumPosts.authorId,
      authorName: users.name,
      authorRole: users.role,
      authorAvatarKey: users.avatarKey,
      authorAvatarColor: users.avatarColor,
    })
    .from(forumPosts)
    .innerJoin(users, eq(forumPosts.authorId, users.id))
    .leftJoin(documents, eq(forumPosts.documentId, documents.id))
    .where(eq(forumPosts.topicId, id))
    .orderBy(sql`forum_posts.rowid`).limit(FORUM_PAGE_SIZE).offset((page - 1) * FORUM_PAGE_SIZE);

  const attachments = await listAttachments("topic", id);
  const activeIds = posts.filter(post => !post.deletedAt).map(post => post.id);
  const postFiles = activeIds.length ? await db.select({ id: communityAttachments.id, parentId: communityAttachments.parentId, kind: communityAttachments.kind, mime: communityAttachments.mime, name: communityAttachments.originalName, size: communityAttachments.size }).from(communityAttachments).where(and(eq(communityAttachments.parentType, "post"), inArray(communityAttachments.parentId, activeIds))) : [];
  const filesByPost: Record<string, Awaited<ReturnType<typeof listAttachments>>> = {};
  for (const file of postFiles) if (file.parentId) (filesByPost[file.parentId] ??= []).push(file);

  const reactionRows = posts.length
    ? await db
        .select()
        .from(forumReactions)
        .where(inArray(forumReactions.postId, posts.map((post) => post.id)))
    : [];
  const buckets = new Map<string, Map<ReactionKey, { count: number; mine: boolean }>>();
  for (const row of reactionRows) {
    if (!isReactionKey(row.emoji)) continue;
    const perPost = buckets.get(row.postId) ?? new Map();
    const current = perPost.get(row.emoji) ?? { count: 0, mine: false };
    current.count += 1;
    if (viewerId && row.userId === viewerId) current.mine = true;
    perPost.set(row.emoji, current);
    buckets.set(row.postId, perPost);
  }
  const reactionsByPost: Record<string, ReactionCount[]> = {};
  for (const [postId, perPost] of buckets) {
    reactionsByPost[postId] = [...perPost.entries()].map(([key, value]) => ({
      key,
      count: value.count,
      mine: value.mine,
    }));
  }

  return { topic, posts: posts.map(post => post.deletedAt ? { ...post, body: "Сообщение удалено", anchorJson: null, documentId: null, documentTitle: null } : post), attachments, filesByPost, reactionsByPost, page, pages, total, lastSeq: posts.at(-1)?.seq ?? 0 };
}

export async function listTopicsForDocument(documentId: string, limit = 5) {
  if (!(await featureEnabled("forum"))) return [];
  return db
    .select({
      id: forumTopics.id,
      title: forumTopics.title,
      createdAt: forumTopics.createdAt,
      authorName: users.name,
      replyCount: sql<number>`(select count(*) from forum_posts where topic_id = ${forumTopics.id} and deleted_at is null)`,
    })
    .from(forumTopics)
    .innerJoin(users, eq(forumTopics.authorId, users.id))
    .where(and(eq(forumTopics.documentId, documentId), isNull(forumTopics.seminarId)))
    .orderBy(desc(forumTopics.createdAt))
    .limit(limit);
}

export async function isWatching(userId: string, topicId: string) {
  const [row] = await db
    .select({ userId: forumWatches.userId })
    .from(forumWatches)
    .where(and(eq(forumWatches.userId, userId), eq(forumWatches.topicId, topicId)))
    .limit(1);
  return Boolean(row);
}

export async function setWatch(userId: string, topicId: string, on: boolean) {
  if (on) {
    const latest = sqlite.prepare("SELECT coalesce(max(rowid),0) seq FROM forum_posts WHERE topic_id=?").get(topicId) as { seq: number };
    await db.insert(forumWatches).values({ userId, topicId, lastReadSeq: latest.seq }).onConflictDoNothing();
    return;
  }
  await db
    .delete(forumWatches)
    .where(and(eq(forumWatches.userId, userId), eq(forumWatches.topicId, topicId)));
}

export type { ForumCategory };

export async function unreadForumCount(user: { id: string; role: string } | null) {
  if (!user || !(await featureEnabled("forum", user))) return 0;
  return (sqlite.prepare("SELECT count(*) n FROM forum_posts p JOIN forum_topics t ON t.id=p.topic_id JOIN forum_watches w ON w.topic_id=p.topic_id WHERE w.user_id=? AND t.seminar_id IS NULL AND p.rowid>w.last_read_seq AND p.author_id!=w.user_id AND p.deleted_at IS NULL").get(user.id) as { n: number }).n;
}
