import "server-only";

import { randomUUID } from "crypto";
import { and, avg, count, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  authors,
  categories,
  documentAuthors,
  documentCategories,
  documents,
  friendships,
  libraryItems,
  users,
} from "@/lib/db/schema";
import type { AuthorRow } from "@/lib/db/queries";
import type { LibraryBookSummary, LibraryEntry, LibraryStatus, RatingSummary } from "@/lib/library-types";

export {
  LIBRARY_STATUS_LABELS,
  type LibraryBookSummary,
  type LibraryEntry,
  type LibraryStatus,
  type RatingSummary,
} from "@/lib/library-types";

async function attachSummaries(documentIds: string[]): Promise<Map<string, LibraryBookSummary>> {
  if (documentIds.length === 0) return new Map();

  const [docRows, authorLinks, categoryRows] = await Promise.all([
    db.select().from(documents).where(inArray(documents.id, documentIds)),
    db
      .select({ documentId: documentAuthors.documentId, position: documentAuthors.position, author: authors })
      .from(documentAuthors)
      .innerJoin(authors, eq(documentAuthors.authorId, authors.id))
      .where(inArray(documentAuthors.documentId, documentIds)),
    db.select({ id: categories.id, name: categories.name }).from(categories),
  ]);

  const categoryNameById = new Map(categoryRows.map((row) => [row.id, row.name]));
  const authorsByDoc = new Map<string, AuthorRow[]>();
  for (const link of authorLinks.sort((a, b) => a.position - b.position)) {
    const list = authorsByDoc.get(link.documentId) ?? [];
    list.push(link.author);
    authorsByDoc.set(link.documentId, list);
  }

  const map = new Map<string, LibraryBookSummary>();
  for (const doc of docRows) {
    map.set(doc.id, {
      id: doc.id,
      title: doc.title,
      alternateTitle: doc.alternateTitle,
      year: doc.year,
      fileType: doc.fileType,
      categoryId: doc.categoryId,
      categoryName: categoryNameById.get(doc.categoryId) ?? null,
      authors: authorsByDoc.get(doc.id) ?? [],
    });
  }
  return map;
}

export async function getLibraryForUser(userId: string): Promise<LibraryEntry[]> {
  const rows = await db
    .select()
    .from(libraryItems)
    .where(eq(libraryItems.userId, userId))
    .orderBy(desc(libraryItems.updatedAt));

  const summaries = await attachSummaries(rows.map((row) => row.documentId));

  return rows
    .filter((row) => summaries.has(row.documentId))
    .map((row) => ({
      itemId: row.id,
      status: row.status,
      note: row.note,
      rating: row.rating,
      reviewBody: row.reviewBody,
      updatedAt: row.updatedAt,
      progressPage: row.progressPage ?? null,
      progressTotal: row.progressTotal ?? null,
      document: summaries.get(row.documentId)!,
    }));
}

/** Counts for the little summary line at the top of "/library". */
export async function getLibraryStats(userId: string) {
  const rows = await db
    .select({ status: libraryItems.status, value: count() })
    .from(libraryItems)
    .where(eq(libraryItems.userId, userId))
    .groupBy(libraryItems.status);
  const byStatus: Record<LibraryStatus, number> = { want: 0, reading: 0, done: 0 };
  for (const row of rows) byStatus[row.status] = row.value;
  return byStatus;
}

export async function getLibraryStatusMap(userId: string): Promise<Map<string, LibraryStatus>> {
  const rows = await db
    .select({ documentId: libraryItems.documentId, status: libraryItems.status })
    .from(libraryItems)
    .where(eq(libraryItems.userId, userId));
  return new Map(rows.map((row) => [row.documentId, row.status]));
}

export async function getLibraryStatusForDocument(userId: string, documentId: string) {
  const [row] = await db
    .select()
    .from(libraryItems)
    .where(and(eq(libraryItems.userId, userId), eq(libraryItems.documentId, documentId)))
    .limit(1);
  return row ?? null;
}

export async function addOrUpdateLibraryItem({
  userId,
  documentId,
  status,
  note,
  rating,
  reviewBody,
}: {
  userId: string;
  documentId: string;
  status: LibraryStatus;
  note?: string | null;
  rating?: number | null;
  reviewBody?: string | null;
}) {
  const existing = await getLibraryStatusForDocument(userId, documentId);
  if (existing) {
    await db
      .update(libraryItems)
      .set({
        status,
        note: note ?? existing.note,
        rating: rating === undefined ? existing.rating : rating,
        reviewBody: reviewBody === undefined ? existing.reviewBody : reviewBody,
        updatedAt: sql`(current_timestamp)`,
      })
      .where(eq(libraryItems.id, existing.id));
    return existing.id;
  }
  const id = randomUUID();
  await db.insert(libraryItems).values({
    id,
    userId,
    documentId,
    status,
    note: note ?? null,
    rating: rating ?? null,
    reviewBody: reviewBody ?? null,
  });
  return id;
}

export async function removeLibraryItem(userId: string, documentId: string) {
  await db
    .delete(libraryItems)
    .where(and(eq(libraryItems.userId, userId), eq(libraryItems.documentId, documentId)));
}

/** Aggregate star rating shown on a document's page — everyone's rating counts, not just friends'. */
export async function getRatingSummary(documentId: string): Promise<RatingSummary> {
  const [row] = await db
    .select({ average: avg(libraryItems.rating), count: count(libraryItems.rating) })
    .from(libraryItems)
    .where(and(eq(libraryItems.documentId, documentId), isNotNull(libraryItems.rating)));
  return { average: row?.average ? Number(row.average) : 0, count: row?.count ?? 0 };
}

export type PublicReview = {
  itemId: string;
  userId: string;
  userName: string;
  rating: number | null;
  reviewBody: string | null;
  updatedAt: string;
};

/** Reviews/ratings left by other readers, shown under the book — the
 * viewer's own entry is edited separately via the rate/review panel, so
 * it's excluded here to avoid showing it twice. */
export async function getPublicReviews(documentId: string, excludeUserId?: string | null): Promise<PublicReview[]> {
  const conditions = [
    eq(libraryItems.documentId, documentId),
    sql`(${libraryItems.rating} IS NOT NULL OR ${libraryItems.reviewBody} IS NOT NULL)`,
  ];
  if (excludeUserId) conditions.push(sql`${libraryItems.userId} != ${excludeUserId}`);

  const rows = await db
    .select({
      itemId: libraryItems.id,
      userId: libraryItems.userId,
      userName: users.name,
      rating: libraryItems.rating,
      reviewBody: libraryItems.reviewBody,
      updatedAt: libraryItems.updatedAt,
    })
    .from(libraryItems)
    .innerJoin(users, eq(users.id, libraryItems.userId))
    .where(and(...conditions))
    .orderBy(desc(libraryItems.updatedAt));

  return rows;
}

export type UserReview = {
  itemId: string;
  rating: number | null;
  reviewBody: string | null;
  updatedAt: string;
  document: LibraryBookSummary;
};

/** All public ratings/reviews left by one user, for their profile page. */
export async function getReviewsByUser(userId: string): Promise<UserReview[]> {
  const rows = await db
    .select()
    .from(libraryItems)
    .where(
      and(
        eq(libraryItems.userId, userId),
        sql`(${libraryItems.rating} IS NOT NULL OR ${libraryItems.reviewBody} IS NOT NULL)`,
      ),
    )
    .orderBy(desc(libraryItems.updatedAt));

  const summaries = await attachSummaries(rows.map((row) => row.documentId));
  return rows
    .filter((row) => summaries.has(row.documentId))
    .map((row) => ({
      itemId: row.id,
      rating: row.rating,
      reviewBody: row.reviewBody,
      updatedAt: row.updatedAt,
      document: summaries.get(row.documentId)!,
    }));
}

export type PopularBook = { document: LibraryBookSummary; shelvedCount: number };

/** Most-shelved books across the whole site, for the "Популярное" shelf on "/library". */
export async function getPopularBooks(limit = 12): Promise<PopularBook[]> {
  const rows = await db
    .select({ documentId: libraryItems.documentId, value: count() })
    .from(libraryItems)
    .groupBy(libraryItems.documentId)
    .orderBy(desc(count()))
    .limit(limit);

  const summaries = await attachSummaries(rows.map((row) => row.documentId));
  return rows
    .filter((row) => summaries.has(row.documentId))
    .map((row) => ({ document: summaries.get(row.documentId)!, shelvedCount: row.value }));
}

export type FriendActivityEntry = {
  itemId: string;
  userId: string;
  userName: string;
  status: LibraryStatus;
  rating: number | null;
  reviewBody: string | null;
  updatedAt: string;
  document: LibraryBookSummary;
};

/**
 * Recent shelf activity from a user's accepted friends — what they've
 * started, finished, or rated — for the small feed on "/friends". Reuses
 * `updatedAt` as the activity timestamp rather than keeping a separate
 * event log, since a shelf entry only ever represents its *latest* status
 * anyway (no history of "reading -> done" transitions is kept elsewhere).
 */
export async function getFriendActivity(userId: string, limit = 20): Promise<FriendActivityEntry[]> {
  const friendRows = await db
    .select({ requesterId: friendships.requesterId, addresseeId: friendships.addresseeId })
    .from(friendships)
    .where(and(eq(friendships.status, "accepted"), sql`(${friendships.requesterId} = ${userId} OR ${friendships.addresseeId} = ${userId})`));
  const friendIds = friendRows.map((row) => (row.requesterId === userId ? row.addresseeId : row.requesterId));
  if (friendIds.length === 0) return [];

  const rows = await db
    .select({ item: libraryItems, userName: users.name })
    .from(libraryItems)
    .innerJoin(users, eq(users.id, libraryItems.userId))
    .where(inArray(libraryItems.userId, friendIds))
    .orderBy(desc(libraryItems.updatedAt))
    .limit(limit);

  const summaries = await attachSummaries(rows.map((row) => row.item.documentId));

  return rows
    .filter((row) => summaries.has(row.item.documentId))
    .map((row) => ({
      itemId: row.item.id,
      userId: row.item.userId,
      userName: row.userName,
      status: row.item.status,
      rating: row.item.rating,
      reviewBody: row.item.reviewBody,
      updatedAt: row.item.updatedAt,
      document: summaries.get(row.item.documentId)!,
    }));
}

/**
 * Simple content-based recommendations: score every document the user
 * doesn't already have on their shelf by how many categories/authors it
 * shares with what's already there, then return the top matches. Runs
 * in-memory since the catalog is a few thousand rows at most — cheap enough
 * for an occasional page load, and far simpler than standing up a real
 * scoring pipeline for a personal-project library.
 */
export async function getRecommendationsForUser(userId: string, limit = 8): Promise<LibraryBookSummary[]> {
  const owned = await db
    .select({ documentId: libraryItems.documentId })
    .from(libraryItems)
    .where(eq(libraryItems.userId, userId));
  const ownedIds = new Set(owned.map((row) => row.documentId));
  if (ownedIds.size === 0) return [];

  const [ownedDocRows, ownedSecondaryRows, ownedAuthorRows] = await Promise.all([
    db.select({ id: documents.id, categoryId: documents.categoryId }).from(documents).where(inArray(documents.id, [...ownedIds])),
    db.select().from(documentCategories).where(inArray(documentCategories.documentId, [...ownedIds])),
    db.select().from(documentAuthors).where(inArray(documentAuthors.documentId, [...ownedIds])),
  ]);

  const wantedCategoryIds = new Map<string, number>();
  for (const row of ownedDocRows) {
    wantedCategoryIds.set(row.categoryId, (wantedCategoryIds.get(row.categoryId) ?? 0) + 1);
  }
  for (const row of ownedSecondaryRows) {
    wantedCategoryIds.set(row.categoryId, (wantedCategoryIds.get(row.categoryId) ?? 0) + 1);
  }
  const wantedAuthorIds = new Set(ownedAuthorRows.map((row) => row.authorId));

  const [allDocRows, allSecondaryRows, allAuthorRows] = await Promise.all([
    db.select({ id: documents.id, categoryId: documents.categoryId }).from(documents),
    db.select().from(documentCategories),
    db.select().from(documentAuthors),
  ]);

  const categoriesByDoc = new Map<string, string[]>();
  for (const row of allDocRows) categoriesByDoc.set(row.id, [row.categoryId]);
  for (const row of allSecondaryRows) {
    categoriesByDoc.set(row.documentId, [...(categoriesByDoc.get(row.documentId) ?? []), row.categoryId]);
  }
  const authorsByDoc = new Map<string, string[]>();
  for (const row of allAuthorRows) {
    authorsByDoc.set(row.documentId, [...(authorsByDoc.get(row.documentId) ?? []), row.authorId]);
  }

  const scored: { id: string; score: number }[] = [];
  for (const doc of allDocRows) {
    if (ownedIds.has(doc.id)) continue;
    let score = 0;
    for (const categoryId of categoriesByDoc.get(doc.id) ?? []) {
      score += wantedCategoryIds.get(categoryId) ?? 0;
    }
    for (const authorId of authorsByDoc.get(doc.id) ?? []) {
      if (wantedAuthorIds.has(authorId)) score += 4;
    }
    if (score > 0) scored.push({ id: doc.id, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, limit);
  const summaries = await attachSummaries(top.map((row) => row.id));
  return top.map((row) => summaries.get(row.id)!).filter(Boolean);
}
