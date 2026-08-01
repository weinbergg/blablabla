import "server-only";

import { randomUUID } from "crypto";
import { and, count, eq, inArray, or } from "drizzle-orm";
import { db, sqlite } from "@/lib/db/client";
import { friendships, users } from "@/lib/db/schema";

export type FriendUser = { id: string; name: string; role: string };

export type FriendsData = {
  friends: (FriendUser & { friendshipId: string })[];
  incoming: (FriendUser & { friendshipId: string })[];
  outgoing: (FriendUser & { friendshipId: string })[];
};

export async function getFriendsData(userId: string): Promise<FriendsData> {
  const rows = await db
    .select({
      id: friendships.id,
      requesterId: friendships.requesterId,
      addresseeId: friendships.addresseeId,
      status: friendships.status,
    })
    .from(friendships)
    .where(or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)));

  if (rows.length === 0) return { friends: [], incoming: [], outgoing: [] };

  const otherUserIds = rows.map((row) => (row.requesterId === userId ? row.addresseeId : row.requesterId));
  const userRows = await db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(inArray(users.id, otherUserIds));
  const userById = new Map(userRows.map((row) => [row.id, row]));

  const friends: (FriendUser & { friendshipId: string })[] = [];
  const incoming: (FriendUser & { friendshipId: string })[] = [];
  const outgoing: (FriendUser & { friendshipId: string })[] = [];

  for (const row of rows) {
    const otherId = row.requesterId === userId ? row.addresseeId : row.requesterId;
    const other = userById.get(otherId);
    if (!other) continue;
    if (row.status === "accepted") {
      friends.push({ ...other, friendshipId: row.id });
    } else if (row.addresseeId === userId) {
      incoming.push({ ...other, friendshipId: row.id });
    } else {
      outgoing.push({ ...other, friendshipId: row.id });
    }
  }

  return { friends, incoming, outgoing };
}

/** Cheap badge count for the header — how many incoming requests await a reply. */
export async function getIncomingFriendRequestCount(userId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(friendships)
    .where(and(eq(friendships.addresseeId, userId), eq(friendships.status, "pending")));
  return row?.value ?? 0;
}

export async function getUserPublicInfo(userId: string): Promise<FriendUser | null> {
  const [row] = await db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}

export type PublicProfile = { id: string; name: string; role: string; createdAt: string };

export async function getPublicProfile(userId: string): Promise<PublicProfile | null> {
  const [row] = await db
    .select({ id: users.id, name: users.name, role: users.role, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}

export async function areFriends(userAId: string, userBId: string) {
  const [row] = await db
    .select({ id: friendships.id })
    .from(friendships)
    .where(
      and(
        eq(friendships.status, "accepted"),
        or(
          and(eq(friendships.requesterId, userAId), eq(friendships.addresseeId, userBId)),
          and(eq(friendships.requesterId, userBId), eq(friendships.addresseeId, userAId)),
        ),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export type FriendshipStatus = {
  status: "none" | "pending_outgoing" | "pending_incoming" | "accepted";
  friendshipId: string | null;
};

/** The full relationship between two users, for rendering the right button
 * (Add / Pending / Accept / Friends) on a profile page. */
export async function getFriendshipStatus(viewerId: string, otherId: string): Promise<FriendshipStatus> {
  const [row] = await db
    .select()
    .from(friendships)
    .where(
      or(
        and(eq(friendships.requesterId, viewerId), eq(friendships.addresseeId, otherId)),
        and(eq(friendships.requesterId, otherId), eq(friendships.addresseeId, viewerId)),
      ),
    )
    .limit(1);
  if (!row) return { status: "none", friendshipId: null };
  if (row.status === "accepted") return { status: "accepted", friendshipId: row.id };
  return {
    status: row.requesterId === viewerId ? "pending_outgoing" : "pending_incoming",
    friendshipId: row.id,
  };
}

export async function sendFriendRequest(
  requesterId: string,
  addresseeId: string,
): Promise<{ friendshipId: string; status: "pending" | "accepted" }> {
  if (requesterId === addresseeId) {
    throw new Error("Нельзя добавить в друзья самого себя.");
  }
  const [addressee] = await db
    .select({ id: users.id, status: users.status })
    .from(users)
    .where(eq(users.id, addresseeId))
    .limit(1);
  if (!addressee || addressee.status !== "active") {
    throw new Error("Пользователь не найден.");
  }

  const [existing] = await db
    .select()
    .from(friendships)
    .where(
      or(
        and(eq(friendships.requesterId, requesterId), eq(friendships.addresseeId, addresseeId)),
        and(eq(friendships.requesterId, addresseeId), eq(friendships.addresseeId, requesterId)),
      ),
    )
    .limit(1);
  if (existing) {
    if (existing.status === "accepted") {
      return { friendshipId: existing.id, status: "accepted" };
    }
    // They already asked us — treat "add" as accept (common UX expectation).
    if (existing.addresseeId === requesterId && existing.status === "pending") {
      await acceptFriendshipRow(existing.id);
      return { friendshipId: existing.id, status: "accepted" };
    }
    throw new Error("Заявка уже отправлена — дождитесь ответа.");
  }
  const id = randomUUID();
  await db.insert(friendships).values({ id, requesterId, addresseeId, status: "pending" });
  return { friendshipId: id, status: "pending" };
}

function acceptFriendshipRow(friendshipId: string) {
  // Raw SQL: reliable write path for the status flip (ORM update was flaky in prod).
  const result = sqlite
    .prepare(`UPDATE friendships SET status = 'accepted' WHERE id = ? AND status = 'pending'`)
    .run(friendshipId);
  if (result.changes === 0) {
    const row = sqlite.prepare(`SELECT status FROM friendships WHERE id = ?`).get(friendshipId) as
      | { status: string }
      | undefined;
    if (row?.status === "accepted") return;
    throw new Error("Не удалось сохранить принятие заявки.");
  }
}

/** Ownership check baked in: only the addressee may accept/decline, and
 * either side may remove an accepted friendship or cancel a pending one. */
export async function respondToFriendRequest(friendshipId: string, userId: string, action: "accept" | "decline") {
  const [row] = await db.select().from(friendships).where(eq(friendships.id, friendshipId)).limit(1);
  if (!row) {
    throw new Error("Заявка не найдена.");
  }
  if (row.addresseeId !== userId) {
    throw new Error("Принять может только тот, кому отправили заявку.");
  }
  if (row.status === "accepted") {
    return { friendshipId: row.id, status: "accepted" as const };
  }
  if (row.status !== "pending") {
    throw new Error("Заявка уже обработана.");
  }
  if (action === "accept") {
    await acceptFriendshipRow(friendshipId);
    return { friendshipId, status: "accepted" as const };
  }
  await db.delete(friendships).where(eq(friendships.id, friendshipId));
  return { friendshipId, status: "declined" as const };
}

export async function removeFriendship(friendshipId: string, userId: string) {
  const [row] = await db.select().from(friendships).where(eq(friendships.id, friendshipId)).limit(1);
  if (!row || (row.requesterId !== userId && row.addresseeId !== userId)) {
    throw new Error("Не найдено.");
  }
  await db.delete(friendships).where(eq(friendships.id, friendshipId));
}
