import "server-only";

import { randomUUID } from "crypto";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "./client";
import { channelPosts, channels, documents, users } from "./schema";
import { slugify } from "@/lib/transliterate";

const NEWS_SLUG = "library";
const RESERVED = new Set(["library", "news", "new", "admin", "channels", "index"]);

export type ChannelRow = typeof channels.$inferSelect;
export type ChannelPostRow = typeof channelPosts.$inferSelect;

function uniqueSlug(base: string, extra: string) {
  const cleaned = slugify(base) || "kanal";
  const suffix = extra.replace(/-/g, "").slice(0, 6);
  return `${cleaned.slice(0, 48)}-${suffix}`;
}

export async function listAuthorChannels() {
  const rows = await db
    .select({
      id: channels.id,
      slug: channels.slug,
      title: channels.title,
      description: channels.description,
      ownerId: channels.ownerId,
      ownerName: users.name,
      ownerAvatarKey: users.avatarKey,
      ownerAvatarColor: users.avatarColor,
      createdAt: channels.createdAt,
      postCount: sql<number>`(select count(*) from channel_posts where channel_id = channels.id and published = 1)`,
    })
    .from(channels)
    .innerJoin(users, eq(users.id, channels.ownerId))
    .where(and(eq(channels.kind, "author"), eq(channels.archived, 0)))
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
  pinned: boolean;
  published: boolean;
  createdAt: string;
  documentId: string | null;
  documentTitle: string | null;
  authorName: string;
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
      pinned: channelPosts.pinned,
      published: channelPosts.published,
      createdAt: channelPosts.createdAt,
      documentId: channelPosts.documentId,
      documentTitle: documents.title,
      authorName: users.name,
    })
    .from(channelPosts)
    .innerJoin(users, eq(users.id, channelPosts.authorId))
    .leftJoin(documents, eq(documents.id, channelPosts.documentId))
    .where(
      options.includeDrafts
        ? eq(channelPosts.channelId, channelId)
        : and(eq(channelPosts.channelId, channelId), eq(channelPosts.published, 1)),
    )
    .orderBy(desc(channelPosts.pinned), desc(channelPosts.createdAt));

  return rows.map((row) => ({
    ...row,
    pinned: Boolean(row.pinned),
    published: Boolean(row.published),
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
    .where(and(eq(channelPosts.channelId, channelId), eq(channelPosts.slug, slug)))
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

export async function createPost(options: {
  channelId: string;
  authorId: string;
  title: string;
  body: string;
  documentId?: string | null;
  published?: boolean;
  pinned?: boolean;
}) {
  const title = options.title.trim().slice(0, 160);
  const body = options.body.trim().slice(0, 20_000);
  if (title.length < 2) throw new Error("Нужен заголовок");
  if (body.length < 10) throw new Error("Текст слишком короткий — это колонка, не статус");
  if ((await countRecentPosts(options.authorId)) >= 30) {
    throw new Error("Сегодня уже много записей. Завтра можно снова.");
  }
  if (options.documentId) {
    const [book] = await db.select({ id: documents.id }).from(documents).where(eq(documents.id, options.documentId)).limit(1);
    if (!book) throw new Error("Книга не найдена");
  }

  let slug = slugify(title) || "zapis";
  const clash = await getPostBySlug(options.channelId, slug);
  if (clash) slug = uniqueSlug(title, randomUUID());

  const id = randomUUID();
  await db.insert(channelPosts).values({
    id,
    channelId: options.channelId,
    authorId: options.authorId,
    slug,
    title,
    body,
    documentId: options.documentId || null,
    published: options.published === false ? 0 : 1,
    pinned: options.pinned ? 1 : 0,
  });
  return { id, slug };
}

export async function updatePost(
  id: string,
  patch: Partial<{ title: string; body: string; documentId: string | null; published: boolean; pinned: boolean }>,
) {
  const update: Partial<typeof channelPosts.$inferInsert> = { updatedAt: new Date().toISOString() };
  if (patch.title !== undefined) update.title = patch.title.trim().slice(0, 160);
  if (patch.body !== undefined) update.body = patch.body.trim().slice(0, 20_000);
  if (patch.documentId !== undefined) update.documentId = patch.documentId;
  if (patch.published !== undefined) update.published = patch.published ? 1 : 0;
  if (patch.pinned !== undefined) update.pinned = patch.pinned ? 1 : 0;
  await db.update(channelPosts).set(update).where(eq(channelPosts.id, id));
}

export async function deletePost(id: string) {
  await db.delete(channelPosts).where(eq(channelPosts.id, id));
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
