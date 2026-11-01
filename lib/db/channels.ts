import "server-only";

import { randomUUID } from "crypto";
import { and, desc, eq, gte, isNull, like, or, sql } from "drizzle-orm";
import { db, sqlite } from "./client";
import { channelPermissions } from "@/lib/channel-permissions";
import { savePublication, type PublicationInput } from "@/lib/publication-storage";
import { channelComments, channelModerators, channelPosts, channels, documents, users } from "./schema";
import { slugify } from "@/lib/transliterate";
import { sanitizePlainText } from "@/lib/sanitize-text";

const NEWS_SLUG = "library";
const RESERVED = new Set(["library", "news", "new", "admin", "channels", "index"]);

export type ChannelRow = typeof channels.$inferSelect;
export type ChannelPostRow = typeof channelPosts.$inferSelect;

function uniqueSlug(base: string, extra: string) {
  const cleaned = slugify(base) || "kanal";
  const suffix = extra.replace(/-/g, "").slice(0, 6);
  return `${cleaned.slice(0, 48)}-${suffix}`;
}

export async function listAuthorChannels(q?: string) {
  const needle = q?.trim() ? `%${q.trim().slice(0, 80)}%` : null;
  const rows = await db
    .select({
      id: channels.id,
      slug: channels.slug,
      title: channels.title,
      description: channels.description,
      avatarAttachmentId: channels.avatarAttachmentId,
      coverAttachmentId: channels.coverAttachmentId,
      ownerId: channels.ownerId,
      ownerName: users.name,
      ownerAvatarKey: users.avatarKey,
      ownerAvatarColor: users.avatarColor,
      createdAt: channels.createdAt,
      postCount: sql<number>`(select count(*) from channel_posts where channel_id = channels.id and published = 1 and deleted_at is null)`,
    })
    .from(channels)
    .innerJoin(users, eq(users.id, channels.ownerId))
    .where(
      and(
        eq(channels.kind, "author"),
        eq(channels.archived, 0),
        needle ? or(like(channels.title, needle), like(channels.description, needle)) : undefined,
      ),
    )
    .orderBy(desc(channels.createdAt));
  return rows;
}

export async function getChannelBySlug(slug: string) {
  const [row] = await db
    .select({
      id: channels.id,
      slug: channels.slug,
      title: channels.title,
      description: channels.description,
      avatarAttachmentId: channels.avatarAttachmentId,
      coverAttachmentId: channels.coverAttachmentId,
      ownerId: channels.ownerId,
      kind: channels.kind,
      archived: channels.archived,
      createdAt: channels.createdAt,
      ownerName: users.name,
      ownerAvatarKey: users.avatarKey,
      ownerAvatarColor: users.avatarColor,
    })
    .from(channels)
    .innerJoin(users, eq(users.id, channels.ownerId))
    .where(eq(channels.slug, slug))
    .limit(1);
  return row ?? null;
}

export async function getChannelByOwner(userId: string) {
  const [row] = await db
    .select()
    .from(channels)
    .where(and(eq(channels.ownerId, userId), eq(channels.kind, "author")))
    .limit(1);
  return row ?? null;
}

export async function getNewsChannel() {
  const [row] = await db.select().from(channels).where(eq(channels.kind, "news")).limit(1);
  return row ?? null;
}

export async function ensureNewsChannel(adminId: string) {
  const existing = await getNewsChannel();
  if (existing) return existing;
  const id = randomUUID();
  await db.insert(channels).values({
    id,
    slug: NEWS_SLUG,
    title: "Хроника библиотеки",
    description: "Что происходит с фондом, встречами и оцифровкой — без рекламных полос, только записи.",
    ownerId: adminId,
    kind: "news",
  });
  const [created] = await db.select().from(channels).where(eq(channels.id, id)).limit(1);
  return created;
}

/** Хроника принадлежит площадке: владельцем числится первый админ, писать могут все админы. */
export async function ensureNewsChannelForSite() {
  const existing = await getNewsChannel();
  if (existing) return existing;
  const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1);
  if (!admin) return null;
  return ensureNewsChannel(admin.id);
}

export function formatWhen(value: string) {
  const iso = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

export async function createAuthorChannel(options: {
  ownerId: string;
  title: string;
  description: string | null;
}) {
  const existing = await getChannelByOwner(options.ownerId);
  if (existing) return existing;
  const title = options.title.trim().slice(0, 80);
  if (title.length < 2) throw new Error("Название канала слишком короткое");
  let slug = slugify(title) || uniqueSlug(title, options.ownerId);
  if (RESERVED.has(slug) || (await getChannelBySlug(slug))) {
    slug = uniqueSlug(title, options.ownerId);
  }
  const id = randomUUID();
  await db.insert(channels).values({
    id,
    slug,
    title,
    description: options.description?.trim().slice(0, 400) || null,
    ownerId: options.ownerId,
    kind: "author",
  });
  const [created] = await db.select().from(channels).where(eq(channels.id, id)).limit(1);
  return created;
}

export type PostListItem = {
  id: string;
  slug: string;
  title: string;
  body: string;
  contentJson: string | null;
  revision: number;
  pinned: boolean;
  published: boolean;
  createdAt: string;
  documentId: string | null;
  documentTitle: string | null;
  authorName: string;
  authorId: string;
  commentsOpen: boolean;
};

export async function listChannelPosts(
  channelId: string,
  options: { includeDrafts?: boolean } = {},
): Promise<PostListItem[]> {
  const rows = await db
    .select({
      id: channelPosts.id,
      slug: channelPosts.slug,
      title: channelPosts.title,
      body: channelPosts.body,
      contentJson: channelPosts.contentJson,
      revision: channelPosts.revision,
      pinned: channelPosts.pinned,
      published: channelPosts.published,
      createdAt: channelPosts.createdAt,
      documentId: channelPosts.documentId,
      documentTitle: documents.title,
      authorName: users.name,
      authorId: channelPosts.authorId,
      commentsOpen: channelPosts.commentsOpen,
    })
    .from(channelPosts)
    .innerJoin(users, eq(users.id, channelPosts.authorId))
    .leftJoin(documents, eq(documents.id, channelPosts.documentId))
    .where(and(eq(channelPosts.channelId, channelId), isNull(channelPosts.deletedAt), options.includeDrafts ? undefined : eq(channelPosts.published, 1)))
    .orderBy(desc(channelPosts.pinned), desc(channelPosts.createdAt));

  return rows.map((row) => ({
    ...row,
    pinned: Boolean(row.pinned),
    published: Boolean(row.published),
    commentsOpen: row.commentsOpen !== 0,
  }));
}

export async function listNewsPosts(limit = 40) {
  const news = await getNewsChannel();
  if (!news) return [];
  const posts = await listChannelPosts(news.id);
  return posts.slice(0, limit).map((post) => ({ ...post, channelSlug: news.slug }));
}

export async function getPostBySlug(channelId: string, slug: string) {
  const [row] = await db
    .select({
      id: channelPosts.id,
      channelId: channelPosts.channelId,
      authorId: channelPosts.authorId,
      slug: channelPosts.slug,
      title: channelPosts.title,
      body: channelPosts.body,
      contentJson: channelPosts.contentJson,
      revision: channelPosts.revision,
      documentId: channelPosts.documentId,
      published: channelPosts.published,
      pinned: channelPosts.pinned,
      updatedAt: channelPosts.updatedAt,
      createdAt: channelPosts.createdAt,
      documentTitle: documents.title,
      authorName: users.name,
    })
    .from(channelPosts)
    .innerJoin(users, eq(users.id, channelPosts.authorId))
    .leftJoin(documents, eq(documents.id, channelPosts.documentId))
    .where(and(eq(channelPosts.channelId, channelId), eq(channelPosts.slug, slug), isNull(channelPosts.deletedAt)))
    .limit(1);
  return row ?? null;
}

export async function countRecentPosts(authorId: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(channelPosts)
    .where(and(eq(channelPosts.authorId, authorId), gte(channelPosts.createdAt, since)));
  return Number(row?.count ?? 0);
}

export async function createPost(options: PublicationInput & { channelId: string; authorId: string; title: string; body: string }) {
  return savePublication(sqlite, options.channelId, options.authorId, options);
}

export async function updatePost(id: string, patch: PublicationInput) {
  const [post] = await db.select().from(channelPosts).where(eq(channelPosts.id, id)).limit(1);
  if (!post) throw new Error("Запись не найдена");
  return savePublication(sqlite, post.channelId, post.authorId, patch, id);
}

export async function deletePost(id: string) {
  await db.update(channelPosts).set({ deletedAt: new Date().toISOString(), published: 0 }).where(eq(channelPosts.id, id));
}

export async function getChannelPermissions(channel: { id: string; kind: string; ownerId: string; archived?: number }, user: { id: string; role: string } | null) {
  const [membership] = user ? await db.select().from(channelModerators).where(and(eq(channelModerators.channelId, channel.id), eq(channelModerators.userId, user.id))).limit(1) : [];
  return channelPermissions(channel, user, membership);
}

export function canPostToChannel(
  channel: { kind: string; ownerId: string },
  user: { id: string; role: string },
) {
  if (channel.kind === "news") return user.role === "admin";
  return channel.ownerId === user.id;
}

export function canModerateChannel(
  channel: { kind: string; ownerId: string },
  user: { id: string; role: string },
) {
  if (user.role === "admin") return true;
  return canPostToChannel(channel, user);
}

export async function isChannelModerator(channelId: string, userId: string) {
  const [row] = await db
    .select({ userId: channelModerators.userId })
    .from(channelModerators)
    .where(and(eq(channelModerators.channelId, channelId), eq(channelModerators.userId, userId)))
    .limit(1);
  return Boolean(row);
}

export async function listChannelModerators(channelId: string) {
  return db
    .select({
      userId: channelModerators.userId,
      role: channelModerators.role,
      name: users.name,
    })
    .from(channelModerators)
    .innerJoin(users, eq(users.id, channelModerators.userId))
    .where(eq(channelModerators.channelId, channelId));
}

export async function grantChannelModerator(channelId: string, name: string, role: "admin" | "editor" | "moderator" = "editor") {
  const needle = name.trim();
  if (needle.length < 2) throw new Error("Нужно имя человека");
  const matches = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.name, needle))
    .limit(2);
  if (matches.length === 0) throw new Error("Человек с таким именем не найден");
  if (matches.length > 1) throw new Error("Таких имён несколько — уточните в профиле");
  await db
    .insert(channelModerators)
    .values({ channelId, userId: matches[0].id, role, legacyModeration: 0 })
    .onConflictDoUpdate({ target: [channelModerators.channelId, channelModerators.userId], set: { role, legacyModeration: 0 } });
  return { userId: matches[0].id, name: matches[0].name, role };
}

export async function revokeChannelModerator(channelId: string, userId: string) {
  await db
    .delete(channelModerators)
    .where(and(eq(channelModerators.channelId, channelId), eq(channelModerators.userId, userId)));
}

export type ChannelCommentItem = {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
};

export async function listChannelComments(channelId: string): Promise<ChannelCommentItem[]> {
  return db
    .select({
      id: channelComments.id,
      postId: channelComments.postId,
      authorId: channelComments.authorId,
      authorName: users.name,
      body: channelComments.body,
      createdAt: channelComments.createdAt,
    })
    .from(channelComments)
    .innerJoin(channelPosts, eq(channelPosts.id, channelComments.postId))
    .innerJoin(users, eq(users.id, channelComments.authorId))
    .where(and(eq(channelPosts.channelId, channelId), eq(channelPosts.published, 1), isNull(channelPosts.deletedAt)))
    .orderBy(channelComments.createdAt);
}

export async function addChannelComment(options: { postId: string; authorId: string; body: string; parentId?: string | null }) {
  if (options.body.trim().length > 4000) throw new Error("Комментарий не должен превышать 4000 символов.");
  const body = sanitizePlainText(options.body, 4_000);
  if (body.length < 1) throw new Error("Пустой комментарий");
  const [post] = await db
    .select({ commentsOpen: channelPosts.commentsOpen, published: channelPosts.published })
    .from(channelPosts)
    .where(eq(channelPosts.id, options.postId))
    .limit(1);
  if (!post || post.published !== 1) throw new Error("Запись не найдена");
  if (post.commentsOpen === 0) throw new Error("Комментарии закрыты");
  if (options.parentId) {
    const [parent] = await db.select().from(channelComments).where(eq(channelComments.id, options.parentId)).limit(1);
    if (!parent || parent.postId !== options.postId || parent.parentId) throw new Error("Ответ должен относиться к сообщению этой публикации");
  }
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  await db.insert(channelComments).values({
    id,
    postId: options.postId,
    parentId: options.parentId || null,
    authorId: options.authorId,
    body,
    createdAt,
  });
  return { id, body, createdAt, parentId: options.parentId || null };
}

export async function deleteChannelComment(id: string) {
  await db.delete(channelComments).where(eq(channelComments.id, id));
}
