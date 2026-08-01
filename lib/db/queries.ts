import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "./client";
import {
  annotations,
  authorRelations,
  authors,
  categories,
  categoryRelations,
  comments,
  documentAuthors,
  documentCategories,
  documentEdits,
  documents,
  documentSubjects,
  documentTags,
  feedback,
  invites,
  reports,
  tags,
  users,
} from "./schema";
import { normalizeForSearch } from "@/lib/transliterate";

export type CategoryRow = typeof categories.$inferSelect;
export type DocumentRow = typeof documents.$inferSelect;
export type AuthorRow = typeof authors.$inferSelect;
export type TagRow = typeof tags.$inferSelect;

export type CategoryNode = CategoryRow & {
  children: CategoryNode[];
  documentCount: number;
};

async function allCategories() {
  return db.select().from(categories).orderBy(asc(categories.sortOrder));
}

/** Direct counts per category, counting a document once for its primary
 * category and once more for every secondary category it's cross-listed
 * into — a text filed under three sections should show up in all three. */
async function documentCountsByCategory() {
  const [primaryRows, secondaryRows] = await Promise.all([
    db.select({ categoryId: documents.categoryId }).from(documents),
    db.select({ categoryId: documentCategories.categoryId }).from(documentCategories),
  ]);
  const counts = new Map<string, number>();
  for (const row of [...primaryRows, ...secondaryRows]) {
    counts.set(row.categoryId, (counts.get(row.categoryId) ?? 0) + 1);
  }
  return counts;
}

/**
 * Cumulative (own + every descendant's) document counts for every category —
 * shared by the catalog pages, the category tree, and the graph, so a
 * section that only groups subsections never shows a misleading "0 текстов"
 * just because nothing is filed directly under it.
 */
async function cumulativeCountsByCategory(): Promise<Map<string, number>> {
  const [rows, directCounts] = await Promise.all([allCategories(), documentCountsByCategory()]);

  const childrenByParent = new Map<string, string[]>();
  for (const category of rows) {
    if (!category.parentId) continue;
    childrenByParent.set(category.parentId, [
      ...(childrenByParent.get(category.parentId) ?? []),
      category.id,
    ]);
  }

  const cumulativeCounts = new Map<string, number>();
  function cumulativeCount(id: string): number {
    if (cumulativeCounts.has(id)) return cumulativeCounts.get(id)!;
    const total =
      (directCounts.get(id) ?? 0) +
      (childrenByParent.get(id) ?? []).reduce((sum, childId) => sum + cumulativeCount(childId), 0);
    cumulativeCounts.set(id, total);
    return total;
  }
  for (const category of rows) cumulativeCount(category.id);
  return cumulativeCounts;
}

/** Builds the full category tree with cumulative (own + descendants') document counts. */
/** "Без категории" and any category with nothing in it (directly or in a
 * descendant) shouldn't clutter public browsing — they're still returned by
 * getCategoryTree/getChildCategories as-is (the admin dashboard needs the
 * full list to file documents into a brand-new, still-empty category), it's
 * just the public-facing pages that filter them out with this. */
export function isPubliclyVisibleCategory(node: { slug: string; documentCount: number }): boolean {
  return node.slug !== "bez-kategorii" && node.documentCount > 0;
}

export async function getCategoryTree(): Promise<CategoryNode[]> {
  const [rows, counts] = await Promise.all([allCategories(), cumulativeCountsByCategory()]);

  const nodeById = new Map<string, CategoryNode>();
  for (const row of rows) {
    nodeById.set(row.id, { ...row, children: [], documentCount: counts.get(row.id) ?? 0 });
  }

  const roots: CategoryNode[] = [];
  for (const row of rows) {
    const node = nodeById.get(row.id)!;
    if (row.parentId && nodeById.has(row.parentId)) {
      nodeById.get(row.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export async function getCategoryBySlugPath(segments: string[]) {
  if (segments.length === 0) return null;

  let parentId: string | null = null;
  let current: CategoryRow | null = null;
  const trail: CategoryRow[] = [];

  for (const slug of segments) {
    const rows = await db
      .select()
      .from(categories)
      .where(eq(categories.slug, slug));
    const match = rows.find((row) => row.parentId === parentId);
    if (!match) return null;
    current = match;
    trail.push(match);
    parentId = match.id;
  }

  return { category: current!, trail };
}

export async function getChildCategories(parentId: string | null) {
  const rows = await db
    .select()
    .from(categories)
    .where(parentId ? eq(categories.parentId, parentId) : isNull(categories.parentId))
    .orderBy(asc(categories.sortOrder));
  const counts = await cumulativeCountsByCategory();
  return rows.map((row) => ({ ...row, documentCount: counts.get(row.id) ?? 0 }));
}

async function attachAuthors<T extends { id: string }>(docs: T[]) {
  if (docs.length === 0) return docs.map((doc) => ({ ...doc, authors: [] as AuthorRow[] }));

  const ids = docs.map((doc) => doc.id);
  const links = await db
    .select({
      documentId: documentAuthors.documentId,
      position: documentAuthors.position,
      author: authors,
    })
    .from(documentAuthors)
    .innerJoin(authors, eq(documentAuthors.authorId, authors.id))
    .where(inArray(documentAuthors.documentId, ids));

  const byDoc = new Map<string, AuthorRow[]>();
  for (const link of links.sort((a, b) => a.position - b.position)) {
    const list = byDoc.get(link.documentId) ?? [];
    list.push(link.author);
    byDoc.set(link.documentId, list);
  }

  return docs.map((doc) => ({ ...doc, authors: byDoc.get(doc.id) ?? [] }));
}

/** People a document is *about* rather than authored by — see `documentSubjects`. */
async function attachSubjects<T extends { id: string }>(docs: T[]) {
  if (docs.length === 0) return docs.map((doc) => ({ ...doc, subjects: [] as AuthorRow[] }));

  const ids = docs.map((doc) => doc.id);
  const links = await db
    .select({ documentId: documentSubjects.documentId, author: authors })
    .from(documentSubjects)
    .innerJoin(authors, eq(documentSubjects.authorId, authors.id))
    .where(inArray(documentSubjects.documentId, ids));

  const byDoc = new Map<string, AuthorRow[]>();
  for (const link of links) {
    const list = byDoc.get(link.documentId) ?? [];
    list.push(link.author);
    byDoc.set(link.documentId, list);
  }

  return docs.map((doc) => ({ ...doc, subjects: byDoc.get(doc.id) ?? [] }));
}

async function attachTags<T extends { id: string }>(docs: T[]) {
  if (docs.length === 0) return docs.map((doc) => ({ ...doc, tags: [] as TagRow[] }));

  const ids = docs.map((doc) => doc.id);
  const links = await db
    .select({ documentId: documentTags.documentId, tag: tags })
    .from(documentTags)
    .innerJoin(tags, eq(documentTags.tagId, tags.id))
    .where(inArray(documentTags.documentId, ids));

  const byDoc = new Map<string, TagRow[]>();
  for (const link of links) {
    const list = byDoc.get(link.documentId) ?? [];
    list.push(link.tag);
    byDoc.set(link.documentId, list);
  }

  return docs.map((doc) => ({ ...doc, tags: byDoc.get(doc.id) ?? [] }));
}

export async function getAllTags() {
  return db.select().from(tags).orderBy(asc(tags.name));
}

export async function getTagBySlug(slug: string) {
  const [tag] = await db.select().from(tags).where(eq(tags.slug, slug)).limit(1);
  if (!tag) return null;

  const links = await db
    .select({ documentId: documentTags.documentId })
    .from(documentTags)
    .where(eq(documentTags.tagId, tag.id));
  const docIds = links.map((link) => link.documentId);
  if (!docIds.length) return { tag, documents: [] as (DocumentRow & { authors: AuthorRow[]; category: CategoryRow | null })[] };

  const rows = await db
    .select()
    .from(documents)
    .where(inArray(documents.id, docIds))
    .orderBy(asc(documents.title));
  const withAuthors = await attachAuthors(rows);

  const categoryIds = [...new Set(rows.map((row) => row.categoryId))];
  const categoryRows = categoryIds.length
    ? await db.select().from(categories).where(inArray(categories.id, categoryIds))
    : [];
  const categoryById = new Map(categoryRows.map((row) => [row.id, row]));

  const documentsWithCategory = withAuthors.map((doc) => ({
    ...doc,
    category: categoryById.get(doc.categoryId) ?? null,
  }));

  return { tag, documents: documentsWithCategory };
}

/** Documents filed under this category either as their primary section or
 * as one of their secondary (cross-listed) sections. */
export async function getDocumentsForCategory(categoryId: string) {
  const secondaryLinks = await db
    .select({ documentId: documentCategories.documentId })
    .from(documentCategories)
    .where(eq(documentCategories.categoryId, categoryId));
  const secondaryIds = secondaryLinks.map((link) => link.documentId);

  const rows = await db
    .select()
    .from(documents)
    .where(
      secondaryIds.length
        ? or(eq(documents.categoryId, categoryId), inArray(documents.id, secondaryIds))
        : eq(documents.categoryId, categoryId),
    )
    .orderBy(asc(documents.title));
  return attachSubjects(await attachTags(await attachAuthors(rows)));
}

export async function getRecentDocuments(limit = 6) {
  const rows = await db
    .select()
    .from(documents)
    .orderBy(desc(documents.createdAt))
    .limit(limit);
  return attachAuthors(rows);
}

export async function getAllDocumentsForSearch() {
  const rows = await db.select().from(documents);
  return attachSubjects(await attachTags(await attachAuthors(rows)));
}

/** A document's secondary (cross-listed) categories, beyond its primary `categoryId`. */
export async function getSecondaryCategories(documentId: string) {
  const rows = await db
    .select({ category: categories })
    .from(documentCategories)
    .innerJoin(categories, eq(documentCategories.categoryId, categories.id))
    .where(eq(documentCategories.documentId, documentId));
  return rows.map((row) => row.category);
}

/** Secondary category ids for every document in one query, for admin list views. */
export async function getAllSecondaryCategoryIdsByDoc(): Promise<Map<string, string[]>> {
  const rows = await db.select().from(documentCategories);
  const map = new Map<string, string[]>();
  for (const row of rows) {
    map.set(row.documentId, [...(map.get(row.documentId) ?? []), row.categoryId]);
  }
  return map;
}

export async function getDocumentById(id: string) {
  const rows = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!rows[0]) return null;
  const [withAuthors] = await attachAuthors([rows[0]]);
  const [withTags] = await attachTags([withAuthors]);
  const [withSubjects] = await attachSubjects([withTags]);
  const secondaryCategories = await getSecondaryCategories(id);
  return { ...withSubjects, secondaryCategories };
}

export async function getAuthorBySlug(slug: string) {
  const [author] = await db.select().from(authors).where(eq(authors.slug, slug)).limit(1);
  if (!author) return null;

  const links = await db
    .select({ documentId: documentAuthors.documentId })
    .from(documentAuthors)
    .where(eq(documentAuthors.authorId, author.id));
  const docIds = links.map((link) => link.documentId);
  if (!docIds.length) return { author, documents: [] as (DocumentRow & { authors: AuthorRow[]; category: CategoryRow | null })[] };

  const rows = await db
    .select()
    .from(documents)
    .where(inArray(documents.id, docIds))
    .orderBy(asc(documents.title));
  const withAuthors = await attachAuthors(rows);

  const categoryIds = [...new Set(rows.map((row) => row.categoryId))];
  const categoryRows = categoryIds.length
    ? await db.select().from(categories).where(inArray(categories.id, categoryIds))
    : [];
  const categoryById = new Map(categoryRows.map((row) => [row.id, row]));

  const documentsWithCategory = withAuthors.map((doc) => ({
    ...doc,
    category: categoryById.get(doc.categoryId) ?? null,
  }));

  return { author, documents: documentsWithCategory };
}

/** Other authors who share at least one category with the given author — used for "related authors" cross-links. */
export async function getRelatedAuthors(authorId: string, excludeAuthorId: string) {
  const relations = await db
    .select()
    .from(authorRelations)
    .where(or(eq(authorRelations.authorAId, authorId), eq(authorRelations.authorBId, authorId)));

  const otherIds = relations.map((rel) =>
    rel.authorAId === authorId ? rel.authorBId : rel.authorAId,
  );
  if (!otherIds.length) return [];

  const rows = await db.select().from(authors).where(inArray(authors.id, otherIds));
  const labelById = new Map(
    relations.map((rel) => [
      rel.authorAId === authorId ? rel.authorBId : rel.authorAId,
      rel.label,
    ]),
  );
  return rows
    .filter((row) => row.id !== excludeAuthorId)
    .map((row) => ({ ...row, relationLabel: labelById.get(row.id) ?? null }));
}

export async function getCategoryTrail(categoryId: string) {
  const trail: CategoryRow[] = [];
  let currentId: string | null = categoryId;
  const byId = new Map((await allCategories()).map((row) => [row.id, row]));

  while (currentId) {
    const row = byId.get(currentId);
    if (!row) break;
    trail.unshift(row);
    currentId = row.parentId;
  }

  return trail;
}

export function matchesSearch(query: string, ...fields: (string | null | undefined)[]) {
  const normalizedQuery = normalizeForSearch(query);
  if (!normalizedQuery) return false;
  return fields.some(
    (field) => field && normalizeForSearch(field).includes(normalizedQuery),
  );
}

export async function getDocumentComments(documentId: string) {
  const rows = await db
    .select({
      id: comments.id,
      documentId: comments.documentId,
      parentId: comments.parentId,
      annotationId: comments.annotationId,
      page: comments.page,
      body: comments.body,
      createdAt: comments.createdAt,
      updatedAt: comments.updatedAt,
      authorId: comments.authorId,
      authorName: users.name,
    })
    .from(comments)
    .innerJoin(users, eq(comments.authorId, users.id))
    .where(eq(comments.documentId, documentId))
    .orderBy(asc(comments.createdAt));

  return rows;
}

export type AnchorRect = { x: number; y: number; w: number; h: number };

export type MyAnnotationRow = {
  id: string;
  documentId: string;
  documentTitle: string;
  page: number;
  shape: string;
  color: string;
  body: string;
  visibility: "public" | "private";
  anchorText: string | null;
  createdAt: string;
};

/** All stickers the user left across the library, newest first. */
export async function getMyAnnotations(userId: string): Promise<MyAnnotationRow[]> {
  const rows = await db
    .select({
      id: annotations.id,
      documentId: annotations.documentId,
      documentTitle: documents.title,
      page: annotations.page,
      shape: annotations.shape,
      color: annotations.color,
      body: annotations.body,
      visibility: annotations.visibility,
      anchorText: annotations.anchorText,
      createdAt: annotations.createdAt,
    })
    .from(annotations)
    .innerJoin(documents, eq(annotations.documentId, documents.id))
    .where(eq(annotations.authorId, userId))
    .orderBy(desc(annotations.createdAt));

  return rows;
}

/** Public annotations plus the current viewer's own private ones. */
export async function getDocumentAnnotations(documentId: string, viewerId: string | null) {
  const visibility = viewerId
    ? or(eq(annotations.visibility, "public"), eq(annotations.authorId, viewerId))
    : eq(annotations.visibility, "public");

  const rows = await db
    .select({
      id: annotations.id,
      documentId: annotations.documentId,
      authorId: annotations.authorId,
      authorName: users.name,
      page: annotations.page,
      x: annotations.x,
      y: annotations.y,
      shape: annotations.shape,
      color: annotations.color,
      body: annotations.body,
      visibility: annotations.visibility,
      allowDiscussion: annotations.allowDiscussion,
      anchorText: annotations.anchorText,
      anchorRects: annotations.anchorRects,
      createdAt: annotations.createdAt,
    })
    .from(annotations)
    .innerJoin(users, eq(annotations.authorId, users.id))
    .where(and(eq(annotations.documentId, documentId), visibility))
    .orderBy(asc(annotations.createdAt));

  return rows.map((row) => ({
    ...row,
    allowDiscussion: Boolean(row.allowDiscussion),
    anchorRects: parseAnchorRects(row.anchorRects),
  }));
}

function parseAnchorRects(raw: string | null): AnchorRect[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function getDocumentEditHistory(documentId: string) {
  return db
    .select({
      id: documentEdits.id,
      field: documentEdits.field,
      oldValue: documentEdits.oldValue,
      newValue: documentEdits.newValue,
      createdAt: documentEdits.createdAt,
      editorName: users.name,
    })
    .from(documentEdits)
    .leftJoin(users, eq(documentEdits.editorId, users.id))
    .where(eq(documentEdits.documentId, documentId))
    .orderBy(desc(documentEdits.createdAt));
}

export function flattenCategoryOptions(
  nodes: CategoryNode[],
  depth = 0,
): { id: string; label: string }[] {
  return nodes.flatMap((node) => [
    { id: node.id, label: `${"— ".repeat(depth)}${node.name}` },
    ...flattenCategoryOptions(node.children, depth + 1),
  ]);
}

export type GraphNode = {
  id: string;
  label: string;
  type: "category" | "author";
  documentCount?: number;
  /** Direct documents only (not descendants) — categories only, used for sizing in hierarchical layouts. */
  directDocumentCount?: number;
  href?: string;
  /** Only set for category nodes — lets client layouts (e.g. circle packing) rebuild the tree. */
  parentId?: string;
  /** Depth in the category tree (0 = root). Authors omit this. */
  depth?: number;
  /** True for authors we consider well-known enough to label by name (has a curated relation, or several works here). */
  notable?: boolean;
};

export type GraphEdge = {
  source: string;
  target: string;
  label?: string;
  kind: "hierarchy" | "relation" | "authorship";
};

export async function getGraphData() {
  const [categoryRows, authorRows, docRows, docAuthorRows, catRelRows, authorRelRows, docCategoryRows] =
    await Promise.all([
      db.select().from(categories),
      db.select().from(authors),
      db
        .select({ id: documents.id, categoryId: documents.categoryId, title: documents.title })
        .from(documents),
      db.select().from(documentAuthors),
      db.select().from(categoryRelations),
      db.select().from(authorRelations),
      db.select().from(documentCategories),
    ]);

  const [directCounts, cumulativeCounts] = await Promise.all([
    documentCountsByCategory(),
    cumulativeCountsByCategory(),
  ]);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const categoryHasContent = new Set<string>();
  const categoryById = new Map(categoryRows.map((row) => [row.id, row]));

  // Every category a document belongs to — its primary section plus any
  // secondary (cross-listed) ones — used both to link authors into all of
  // their work's sections, and to draw an edge between two sections that
  // happen to share a work (e.g. a text filed under both "История" and
  // "Философия").
  const allCategoryIdsByDoc = new Map<string, string[]>();
  for (const doc of docRows) allCategoryIdsByDoc.set(doc.id, [doc.categoryId]);
  for (const link of docCategoryRows) {
    allCategoryIdsByDoc.set(link.documentId, [
      ...(allCategoryIdsByDoc.get(link.documentId) ?? []),
      link.categoryId,
    ]);
  }

  function categoryHref(id: string): string {
    const slugs: string[] = [];
    let current = categoryById.get(id);
    while (current) {
      slugs.unshift(current.slug);
      current = current.parentId ? categoryById.get(current.parentId) : undefined;
    }
    return `/catalog/${slugs.join("/")}`;
  }

  // "Без категории" is an internal working bucket for unsorted uploads, not
  // a real topic — and any category with nothing in it (directly or in a
  // descendant) is just noise on a map that's meant to show how content
  // actually connects. Both are dropped from the graph the same way they're
  // dropped from the homepage/catalog listings.
  const visibleCategoryIds = new Set(
    categoryRows
      .filter((c) => c.slug !== "bez-kategorii" && (cumulativeCounts.get(c.id) ?? 0) > 0)
      .map((c) => c.id),
  );

  function categoryDepth(id: string): number {
    let depth = 0;
    let current = categoryById.get(id);
    while (current?.parentId && visibleCategoryIds.has(current.parentId)) {
      depth += 1;
      current = categoryById.get(current.parentId);
    }
    return depth;
  }

  for (const category of categoryRows) {
    if (!visibleCategoryIds.has(category.id)) continue;
    // If the parent was filtered out, promote this node to a visible root so
    // clustering/tree layout still places the subsection instead of orphaning it.
    const parentVisible = Boolean(category.parentId && visibleCategoryIds.has(category.parentId));
    nodes.push({
      id: `category:${category.id}`,
      label: category.name,
      type: "category",
      documentCount: cumulativeCounts.get(category.id) ?? 0,
      directDocumentCount: directCounts.get(category.id) ?? 0,
      href: categoryHref(category.id),
      parentId: parentVisible ? `category:${category.parentId}` : undefined,
      depth: categoryDepth(category.id),
    });
    if (parentVisible && category.parentId) {
      edges.push({
        source: `category:${category.parentId}`,
        target: `category:${category.id}`,
        kind: "hierarchy",
      });
    }
  }

  const authorCategoryPairs = new Set<string>();
  const authorDocCount = new Map<string, number>();
  const authorFirstDocId = new Map<string, string>();
  // Primary category only — secondary listings used to fan every author into
  // N sections and made the map unreadable.
  const primaryCategoryByDoc = new Map(docRows.map((d) => [d.id, d.categoryId]));
  for (const link of docAuthorRows) {
    const categoryId = primaryCategoryByDoc.get(link.documentId);
    if (!categoryId || !visibleCategoryIds.has(categoryId)) continue;
    const key = `${link.authorId}:${categoryId}`;
    if (!authorCategoryPairs.has(key)) {
      authorCategoryPairs.add(key);
      categoryHasContent.add(categoryId);
    }
    authorDocCount.set(link.authorId, (authorDocCount.get(link.authorId) ?? 0) + 1);
    if (!authorFirstDocId.has(link.authorId)) authorFirstDocId.set(link.authorId, link.documentId);
  }

  const notableAuthorIds = new Set<string>();
  for (const relation of authorRelRows) {
    notableAuthorIds.add(relation.authorAId);
    notableAuthorIds.add(relation.authorBId);
  }
  const docTitleById = new Map(docRows.map((doc) => [doc.id, doc.title]));

  for (const author of authorRows) {
    const relevantPairs = [...authorCategoryPairs].filter((pair) =>
      pair.startsWith(`${author.id}:`),
    );
    if (relevantPairs.length === 0) continue;

    // Most people browsing the map won't recognize a niche paper author by
    // name — for anyone without a curated relation and with just one work
    // here, label the node with that work's title instead, it's more useful.
    const notable = notableAuthorIds.has(author.id) || (authorDocCount.get(author.id) ?? 0) >= 2;
    const firstDocId = authorFirstDocId.get(author.id);
    const label = notable ? author.name : docTitleById.get(firstDocId ?? "") ?? author.name;
    // When the node is labelled by a document title rather than the author's
    // name, "go to page" should open that document, not an author profile
    // the visitor never asked to see.
    const href = notable || !firstDocId ? `/authors/${author.slug}` : `/documents/${firstDocId}`;

    nodes.push({
      id: `author:${author.id}`,
      label,
      type: "author",
      documentCount: authorDocCount.get(author.id) ?? 1,
      href,
      notable,
    });
    for (const pair of relevantPairs) {
      const categoryId = pair.split(":")[1];
      edges.push({
        source: `author:${author.id}`,
        target: `category:${categoryId}`,
        kind: "authorship",
      });
    }
  }

  for (const relation of catRelRows) {
    if (!visibleCategoryIds.has(relation.categoryAId) || !visibleCategoryIds.has(relation.categoryBId)) continue;
    edges.push({
      source: `category:${relation.categoryAId}`,
      target: `category:${relation.categoryBId}`,
      label: relation.label ?? undefined,
      kind: "relation",
    });
  }

  // Cross-listed documents connect sections — but only when they share at
  // least two works. A single accidental dual-tag used to draw a dense web
  // that drowned the real hierarchy.
  const existingCategoryPairs = new Set(
    edges
      .filter((edge) => edge.kind === "relation" && edge.source.startsWith("category:"))
      .map((edge) => [edge.source, edge.target].sort().join("|")),
  );
  const crossListPairs = new Map<string, { titles: string[]; a: string; b: string; count: number }>();
  for (const [documentId, categoryIds] of allCategoryIdsByDoc) {
    const visible = [...new Set(categoryIds)].filter((id) => visibleCategoryIds.has(id));
    if (visible.length < 2) continue;
    for (let i = 0; i < visible.length; i++) {
      for (let j = i + 1; j < visible.length; j++) {
        const [a, b] = [visible[i], visible[j]].sort();
        const key = `category:${a}|category:${b}`;
        if (existingCategoryPairs.has(key)) continue;
        const entry = crossListPairs.get(key) ?? { titles: [], a, b, count: 0 };
        entry.count += 1;
        if (entry.titles.length < 3) entry.titles.push(docTitleById.get(documentId) ?? "");
        crossListPairs.set(key, entry);
      }
    }
  }
  for (const { a, b, titles, count } of crossListPairs.values()) {
    if (count < 2) continue;
    edges.push({
      source: `category:${a}`,
      target: `category:${b}`,
      label: titles.filter(Boolean).join(", "),
      kind: "relation",
    });
  }

  for (const relation of authorRelRows) {
    edges.push({
      source: `author:${relation.authorAId}`,
      target: `author:${relation.authorBId}`,
      label: relation.label ?? undefined,
      kind: "relation",
    });
  }

  return { nodes, edges };
}

export type ModerationItem = {
  id: string;
  kind: "annotation" | "comment";
  documentId: string;
  documentTitle: string;
  authorId: string;
  authorName: string;
  authorStrikes: number;
  snippet: string;
  page: number | null;
  visibility?: "public" | "private";
  createdAt: string;
  openReports: number;
};

/** Site-wide feed of recent stickers and comments for admins to spot-check, newest first, flagged with any open reports. */
export async function getModerationFeed(limit = 150): Promise<ModerationItem[]> {
  const [annotationRows, commentRows, openReportRows] = await Promise.all([
    db
      .select({
        id: annotations.id,
        documentId: annotations.documentId,
        documentTitle: documents.title,
        authorId: annotations.authorId,
        authorName: users.name,
        authorStrikes: users.strikes,
        body: annotations.body,
        shape: annotations.shape,
        page: annotations.page,
        visibility: annotations.visibility,
        createdAt: annotations.createdAt,
      })
      .from(annotations)
      .innerJoin(users, eq(annotations.authorId, users.id))
      .innerJoin(documents, eq(annotations.documentId, documents.id))
      .orderBy(desc(annotations.createdAt))
      .limit(limit),
    db
      .select({
        id: comments.id,
        documentId: comments.documentId,
        documentTitle: documents.title,
        authorId: comments.authorId,
        authorName: users.name,
        authorStrikes: users.strikes,
        body: comments.body,
        page: comments.page,
        createdAt: comments.createdAt,
      })
      .from(comments)
      .innerJoin(users, eq(comments.authorId, users.id))
      .innerJoin(documents, eq(comments.documentId, documents.id))
      .orderBy(desc(comments.createdAt))
      .limit(limit),
    db.select({ targetId: reports.targetId }).from(reports).where(eq(reports.status, "open")),
  ]);

  const openReportCounts = new Map<string, number>();
  for (const row of openReportRows) {
    openReportCounts.set(row.targetId, (openReportCounts.get(row.targetId) ?? 0) + 1);
  }

  const items: ModerationItem[] = [
    ...annotationRows.map((row) => ({
      id: row.id,
      kind: "annotation" as const,
      documentId: row.documentId,
      documentTitle: row.documentTitle,
      authorId: row.authorId,
      authorName: row.authorName,
      authorStrikes: row.authorStrikes,
      snippet:
        row.shape === "drawing"
          ? row.body.includes('"fullPage":true')
            ? "Рисунок на всей странице"
            : "Рисунок"
          : row.shape === "formula"
            ? `Формула: ${row.body || "—"}`
            : row.body,
      page: row.page,
      visibility: row.visibility,
      createdAt: row.createdAt,
      openReports: openReportCounts.get(row.id) ?? 0,
    })),
    ...commentRows.map((row) => ({
      id: row.id,
      kind: "comment" as const,
      documentId: row.documentId,
      documentTitle: row.documentTitle,
      authorId: row.authorId,
      authorName: row.authorName,
      authorStrikes: row.authorStrikes,
      snippet: row.body,
      page: row.page,
      createdAt: row.createdAt,
      openReports: openReportCounts.get(row.id) ?? 0,
    })),
  ];

  return items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, limit);
}

export type ReportRow = {
  id: string;
  targetType: "annotation" | "comment";
  targetId: string;
  documentId: string;
  documentTitle: string;
  reporterId: string;
  reporterName: string;
  reason: string;
  createdAt: string;
};

export async function getOpenReports(): Promise<ReportRow[]> {
  return db
    .select({
      id: reports.id,
      targetType: reports.targetType,
      targetId: reports.targetId,
      documentId: reports.documentId,
      documentTitle: documents.title,
      reporterId: reports.reporterId,
      reporterName: users.name,
      reason: reports.reason,
      createdAt: reports.createdAt,
    })
    .from(reports)
    .innerJoin(users, eq(reports.reporterId, users.id))
    .innerJoin(documents, eq(reports.documentId, documents.id))
    .where(eq(reports.status, "open"))
    .orderBy(desc(reports.createdAt));
}

export type ReferralRow = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "booster" | "member";
  status: "active" | "banned";
  strikes: number;
  referredCount: number;
  invitesCreated: number;
  invitesUnused: number;
  createdAt: string;
};

/** For the admin "Рефералы" tab — who's bringing people in, and how many of their invite codes are still unused. */
export async function getReferralStats(): Promise<ReferralRow[]> {
  const [allUsers, allInvites] = await Promise.all([
    db.select().from(users).orderBy(asc(users.createdAt)),
    db.select().from(invites),
  ]);

  const referredCountByReferrer = new Map<string, number>();
  for (const u of allUsers) {
    if (!u.referredBy) continue;
    referredCountByReferrer.set(u.referredBy, (referredCountByReferrer.get(u.referredBy) ?? 0) + 1);
  }
  const invitesCreatedBy = new Map<string, number>();
  const invitesUnusedBy = new Map<string, number>();
  for (const invite of allInvites) {
    if (!invite.createdBy) continue;
    invitesCreatedBy.set(invite.createdBy, (invitesCreatedBy.get(invite.createdBy) ?? 0) + 1);
    if (!invite.usedBy) {
      invitesUnusedBy.set(invite.createdBy, (invitesUnusedBy.get(invite.createdBy) ?? 0) + 1);
    }
  }

  return allUsers
    .map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      status: u.status,
      strikes: u.strikes,
      referredCount: referredCountByReferrer.get(u.id) ?? 0,
      invitesCreated: invitesCreatedBy.get(u.id) ?? 0,
      invitesUnused: invitesUnusedBy.get(u.id) ?? 0,
      createdAt: u.createdAt,
    }))
    .sort((a, b) => new Date(`${b.createdAt.replace(" ", "T")}Z`).getTime() - new Date(`${a.createdAt.replace(" ", "T")}Z`).getTime());
}

export type GrowthSummary = {
  total: number;
  last24h: number;
  last7d: number;
  last30d: number;
  /** Signup counts for the last 14 calendar days, oldest first — enough for
   * a small bar chart without pulling in a charting library. */
  dailyLast14: { date: string; count: number }[];
};

/** Powers the growth readout at the top of the admin "Рефералы" tab — cheap
 * to compute in JS since the whole `users` table is at most a few thousand
 * rows for a project like this. */
export async function getGrowthSummary(): Promise<GrowthSummary> {
  const rows = await db.select({ createdAt: users.createdAt }).from(users);
  const now = Date.now();
  const DAY = 86_400_000;
  const timestamps = rows.map((r) => new Date(`${r.createdAt.replace(" ", "T")}Z`).getTime());

  const dayKey = (ts: number) => new Date(ts).toISOString().slice(0, 10);
  const countsByDay = new Map<string, number>();
  for (const ts of timestamps) {
    const key = dayKey(ts);
    countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1);
  }
  const dailyLast14: { date: string; count: number }[] = [];
  for (let i = 13; i >= 0; i -= 1) {
    const key = dayKey(now - i * DAY);
    dailyLast14.push({ date: key, count: countsByDay.get(key) ?? 0 });
  }

  return {
    total: timestamps.length,
    last24h: timestamps.filter((ts) => now - ts <= DAY).length,
    last7d: timestamps.filter((ts) => now - ts <= 7 * DAY).length,
    last30d: timestamps.filter((ts) => now - ts <= 30 * DAY).length,
    dailyLast14,
  };
}

/** A member's own invite codes, for their personal "invite a friend" page. */
export async function getUserInvites(userId: string) {
  return db
    .select()
    .from(invites)
    .where(eq(invites.createdBy, userId))
    .orderBy(desc(invites.createdAt));
}

export async function getReferredCount(userId: string) {
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.referredBy, userId));
  return rows.length;
}

export async function getFeedbackList() {
  return db
    .select({
      id: feedback.id,
      authorId: feedback.authorId,
      authorName: users.name,
      name: feedback.name,
      contact: feedback.contact,
      body: feedback.body,
      status: feedback.status,
      createdAt: feedback.createdAt,
    })
    .from(feedback)
    .leftJoin(users, eq(feedback.authorId, users.id))
    .orderBy(desc(feedback.createdAt));
}
