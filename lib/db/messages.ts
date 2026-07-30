import "server-only";

import { randomUUID } from "crypto";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { conversationParticipants, conversations, directMessages, users } from "@/lib/db/schema";

export type ConversationSummary = {
  id: string;
  title: string | null;
  otherParticipants: { id: string; name: string; role: string }[];
  lastMessage: { body: string; createdAt: string; authorId: string; authorName: string } | null;
  unreadCount: number;
  createdAt: string;
};

/** Every conversation the user takes part in, newest activity first, with
 * enough about the other side to label it in a list (name for a 1:1, a
 * curated title or participant list for a group) without a second
 * round-trip per row. */
export async function getConversationsForUser(userId: string): Promise<ConversationSummary[]> {
  const memberships = await db
    .select({ conversationId: conversationParticipants.conversationId, lastReadAt: conversationParticipants.lastReadAt })
    .from(conversationParticipants)
    .where(eq(conversationParticipants.userId, userId));

  if (memberships.length === 0) return [];
  const conversationIds = memberships.map((m) => m.conversationId);
  const lastReadByConversation = new Map(memberships.map((m) => [m.conversationId, m.lastReadAt]));

  const [conversationRows, participantRows, messageRows] = await Promise.all([
    db.select().from(conversations).where(inArray(conversations.id, conversationIds)),
    db
      .select({
        conversationId: conversationParticipants.conversationId,
        userId: users.id,
        name: users.name,
        role: users.role,
      })
      .from(conversationParticipants)
      .innerJoin(users, eq(users.id, conversationParticipants.userId))
      .where(inArray(conversationParticipants.conversationId, conversationIds)),
    db
      .select({
        id: directMessages.id,
        conversationId: directMessages.conversationId,
        body: directMessages.body,
        createdAt: directMessages.createdAt,
        authorId: directMessages.authorId,
        authorName: users.name,
      })
      .from(directMessages)
      .innerJoin(users, eq(users.id, directMessages.authorId))
      .where(inArray(directMessages.conversationId, conversationIds))
      .orderBy(desc(directMessages.createdAt)),
  ]);

  const participantsByConversation = new Map<string, { id: string; name: string; role: string }[]>();
  for (const row of participantRows) {
    if (row.userId === userId) continue;
    const list = participantsByConversation.get(row.conversationId) ?? [];
    list.push({ id: row.userId, name: row.name, role: row.role });
    participantsByConversation.set(row.conversationId, list);
  }

  const lastMessageByConversation = new Map<string, (typeof messageRows)[number]>();
  const unreadByConversation = new Map<string, number>();
  for (const message of messageRows) {
    if (!lastMessageByConversation.has(message.conversationId)) {
      lastMessageByConversation.set(message.conversationId, message);
    }
    const lastReadAt = lastReadByConversation.get(message.conversationId);
    const isUnread = message.authorId !== userId && (!lastReadAt || message.createdAt > lastReadAt);
    if (isUnread) {
      unreadByConversation.set(message.conversationId, (unreadByConversation.get(message.conversationId) ?? 0) + 1);
    }
  }

  return conversationRows
    .map((conversation) => {
      const last = lastMessageByConversation.get(conversation.id);
      return {
        id: conversation.id,
        title: conversation.title,
        otherParticipants: participantsByConversation.get(conversation.id) ?? [],
        lastMessage: last
          ? { body: last.body, createdAt: last.createdAt, authorId: last.authorId, authorName: last.authorName }
          : null,
        unreadCount: unreadByConversation.get(conversation.id) ?? 0,
        createdAt: conversation.createdAt,
      };
    })
    .sort((a, b) => {
      const aTime = a.lastMessage?.createdAt ?? a.createdAt;
      const bTime = b.lastMessage?.createdAt ?? b.createdAt;
      return bTime.localeCompare(aTime);
    });
}

export async function getTotalUnreadCount(userId: string): Promise<number> {
  const conversationsList = await getConversationsForUser(userId);
  return conversationsList.reduce((sum, c) => sum + c.unreadCount, 0);
}

export async function isConversationParticipant(conversationId: string, userId: string) {
  const [row] = await db
    .select({ userId: conversationParticipants.userId })
    .from(conversationParticipants)
    .where(and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.userId, userId)))
    .limit(1);
  return Boolean(row);
}

export async function getConversationMessages(conversationId: string) {
  return db
    .select({
      id: directMessages.id,
      body: directMessages.body,
      createdAt: directMessages.createdAt,
      authorId: directMessages.authorId,
      authorName: users.name,
    })
    .from(directMessages)
    .innerJoin(users, eq(users.id, directMessages.authorId))
    .where(eq(directMessages.conversationId, conversationId))
    .orderBy(directMessages.createdAt);
}

export async function getConversationParticipants(conversationId: string) {
  return db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(conversationParticipants)
    .innerJoin(users, eq(users.id, conversationParticipants.userId))
    .where(eq(conversationParticipants.conversationId, conversationId));
}

/**
 * A 1:1 chat between the same two people should reuse the existing thread
 * rather than spawning a duplicate every time someone hits "написать" —
 * found by looking for a conversation with exactly these two participants
 * and no one else. Groups (3+ people) always get a fresh conversation since
 * there's no unambiguous "the" group for a given set of members.
 */
async function findExistingDirectConversation(userAId: string, userBId: string) {
  const userAConversations = await db
    .select({ conversationId: conversationParticipants.conversationId })
    .from(conversationParticipants)
    .where(eq(conversationParticipants.userId, userAId));
  if (userAConversations.length === 0) return null;

  const candidateIds = userAConversations.map((row) => row.conversationId);
  const rows = await db
    .select({ conversationId: conversationParticipants.conversationId, userId: conversationParticipants.userId })
    .from(conversationParticipants)
    .where(inArray(conversationParticipants.conversationId, candidateIds));

  const byConversation = new Map<string, Set<string>>();
  for (const row of rows) {
    const set = byConversation.get(row.conversationId) ?? new Set<string>();
    set.add(row.userId);
    byConversation.set(row.conversationId, set);
  }
  for (const [conversationId, memberSet] of byConversation) {
    if (memberSet.size === 2 && memberSet.has(userAId) && memberSet.has(userBId)) {
      return conversationId;
    }
  }
  return null;
}

export async function createConversation({
  creatorId,
  participantIds,
  title,
  firstMessage,
}: {
  creatorId: string;
  participantIds: string[];
  title?: string | null;
  firstMessage: string;
}) {
  const uniqueOthers = [...new Set(participantIds)].filter((id) => id !== creatorId);
  if (uniqueOthers.length === 0) {
    throw new Error("Нужен хотя бы один собеседник.");
  }

  if (uniqueOthers.length === 1) {
    const existingId = await findExistingDirectConversation(creatorId, uniqueOthers[0]);
    if (existingId) {
      await postMessage({ conversationId: existingId, authorId: creatorId, body: firstMessage });
      return existingId;
    }
  }

  const conversationId = randomUUID();
  await db.insert(conversations).values({ id: conversationId, title: title || null, createdBy: creatorId });
  const allParticipants = [creatorId, ...uniqueOthers];
  await db.insert(conversationParticipants).values(
    allParticipants.map((userId) => ({ conversationId, userId })),
  );
  await postMessage({ conversationId, authorId: creatorId, body: firstMessage });
  return conversationId;
}

export async function postMessage({
  conversationId,
  authorId,
  body,
}: {
  conversationId: string;
  authorId: string;
  body: string;
}) {
  const id = randomUUID();
  await db.insert(directMessages).values({ id, conversationId, authorId, body });
  await db
    .update(conversationParticipants)
    .set({ lastReadAt: sql`(current_timestamp)` })
    .where(and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.userId, authorId)));
  return id;
}

export async function markConversationRead(conversationId: string, userId: string) {
  await db
    .update(conversationParticipants)
    .set({ lastReadAt: sql`(current_timestamp)` })
    .where(and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.userId, userId)));
}

export async function searchUsers(query: string, excludeUserId: string, limit = 8) {
  const trimmed = query.trim();
  if (!trimmed) return [];
  return db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(sql`${users.name} LIKE ${`%${trimmed}%`} COLLATE NOCASE`, ne(users.id, excludeUserId), eq(users.status, "active")))
    .limit(limit);
}
