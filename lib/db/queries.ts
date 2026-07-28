import { asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "./client";
import {
  authorRelations,
  authors,
  categories,
  categoryRelations,
  comments,
  documentAuthors,
  documentEdits,
  documents,
  users,
} from "./schema";
import { normalizeForSearch } from "@/lib/transliterate";

export type CategoryRow = typeof categories.$inferSelect;
export type DocumentRow = typeof documents.$inferSelect;
export type AuthorRow = typeof authors.$inferSelect;

export type CategoryNode = CategoryRow & {
  children: CategoryNode[];
  documentCount: number;
};

async function allCategories() {
  return db.select().from(categories).orderBy(asc(categories.sortOrder));
}

async function documentCountsByCategory() {
  const rows = await db
    .select({ categoryId: documents.categoryId })
    .from(documents);
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.categoryId, (counts.get(row.categoryId) ?? 0) + 1);
  }
  return counts;
}

/** Builds the full category tree with per-node and cumulative document counts. */
export async function getCategoryTree(): Promise<CategoryNode[]> {
  const [rows, counts] = await Promise.all([
    allCategories(),
    documentCountsByCategory(),
  ]);

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

  const addChildCounts = (node: CategoryNode): number => {
    const childTotal = node.children.reduce(
      (sum, child) => sum + addChildCounts(child),
      0,
    );
    node.documentCount += childTotal;
    return node.documentCount;
  };
  roots.forEach(addChildCounts);

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
  const counts = await documentCountsByCategory();
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

export async function getDocumentsForCategory(categoryId: string) {
  const rows = await db
    .select()
    .from(documents)
    .where(eq(documents.categoryId, categoryId))
    .orderBy(asc(documents.title));
  return attachAuthors(rows);
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
  return attachAuthors(rows);
}

export async function getDocumentById(id: string) {
  const rows = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!rows[0]) return null;
  const [withAuthors] = await attachAuthors([rows[0]]);
  return withAuthors;
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
};

export type GraphEdge = {
  source: string;
  target: string;
  label?: string;
  kind: "hierarchy" | "relation" | "authorship";
};

export async function getGraphData() {
  const [categoryRows, authorRows, docRows, docAuthorRows, catRelRows, authorRelRows] =
    await Promise.all([
      db.select().from(categories),
      db.select().from(authors),
      db.select({ id: documents.id, categoryId: documents.categoryId }).from(documents),
      db.select().from(documentAuthors),
      db.select().from(categoryRelations),
      db.select().from(authorRelations),
    ]);

  const counts = await documentCountsByCategory();
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const categoryHasContent = new Set<string>();
  const docCategoryById = new Map(docRows.map((doc) => [doc.id, doc.categoryId]));

  for (const category of categoryRows) {
    nodes.push({
      id: `category:${category.id}`,
      label: category.name,
      type: "category",
      documentCount: counts.get(category.id) ?? 0,
    });
    if (category.parentId) {
      edges.push({
        source: `category:${category.parentId}`,
        target: `category:${category.id}`,
        kind: "hierarchy",
      });
    }
  }

  const authorCategoryPairs = new Set<string>();
  for (const link of docAuthorRows) {
    const categoryId = docCategoryById.get(link.documentId);
    if (!categoryId) continue;
    const key = `${link.authorId}:${categoryId}`;
    if (authorCategoryPairs.has(key)) continue;
    authorCategoryPairs.add(key);
    categoryHasContent.add(categoryId);
  }

  for (const author of authorRows) {
    const relevantPairs = [...authorCategoryPairs].filter((pair) =>
      pair.startsWith(`${author.id}:`),
    );
    if (relevantPairs.length === 0) continue;

    nodes.push({ id: `author:${author.id}`, label: author.name, type: "author" });
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
    edges.push({
      source: `category:${relation.categoryAId}`,
      target: `category:${relation.categoryBId}`,
      label: relation.label ?? undefined,
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
