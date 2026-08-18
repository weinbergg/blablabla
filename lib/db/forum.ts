import { desc, eq, sql } from "drizzle-orm";
import { db } from "./client";
import { documents, forumPosts, forumTopics, users } from "./schema";

export async function listForumTopics(limit = 40) {
  const rows = await db
    .select({
      id: forumTopics.id,
      title: forumTopics.title,
      body: forumTopics.body,
      createdAt: forumTopics.createdAt,
      locked: forumTopics.locked,
      authorId: forumTopics.authorId,
      authorName: users.name,
      authorRole: users.role,
      authorAvatarKey: users.avatarKey,
      documentId: forumTopics.documentId,
      documentTitle: documents.title,
      replyCount: sql<number>`(select count(*) from forum_posts where topic_id = ${forumTopics.id})`,
    })
    .from(forumTopics)
    .innerJoin(users, eq(forumTopics.authorId, users.id))
    .leftJoin(documents, eq(forumTopics.documentId, documents.id))
    .orderBy(desc(forumTopics.createdAt))
    .limit(limit);
  return rows;
}

export async function getForumTopic(id: string) {
  const [topic] = await db
    .select({
      id: forumTopics.id,
      title: forumTopics.title,
      body: forumTopics.body,
      createdAt: forumTopics.createdAt,
      locked: forumTopics.locked,
      authorId: forumTopics.authorId,
      authorName: users.name,
      authorRole: users.role,
      authorAvatarKey: users.avatarKey,
      documentId: forumTopics.documentId,
      documentTitle: documents.title,
    })
    .from(forumTopics)
    .innerJoin(users, eq(forumTopics.authorId, users.id))
    .leftJoin(documents, eq(forumTopics.documentId, documents.id))
    .where(eq(forumTopics.id, id))
    .limit(1);
  if (!topic) return null;

  const posts = await db
    .select({
      id: forumPosts.id,
      parentId: forumPosts.parentId,
      body: forumPosts.body,
      createdAt: forumPosts.createdAt,
      updatedAt: forumPosts.updatedAt,
      authorId: forumPosts.authorId,
      authorName: users.name,
      authorRole: users.role,
      authorAvatarKey: users.avatarKey,
    })
    .from(forumPosts)
    .innerJoin(users, eq(forumPosts.authorId, users.id))
    .where(eq(forumPosts.topicId, id))
    .orderBy(forumPosts.createdAt);

  return { topic, posts };
}

export async function listTopicsForDocument(documentId: string, limit = 5) {
  return db
    .select({
      id: forumTopics.id,
      title: forumTopics.title,
      createdAt: forumTopics.createdAt,
      authorName: users.name,
      replyCount: sql<number>`(select count(*) from forum_posts where topic_id = ${forumTopics.id})`,
    })
    .from(forumTopics)
    .innerJoin(users, eq(forumTopics.authorId, users.id))
    .where(eq(forumTopics.documentId, documentId))
    .orderBy(desc(forumTopics.createdAt))
    .limit(limit);
}
