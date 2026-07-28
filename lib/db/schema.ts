import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
};

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "member"] })
    .notNull()
    .default("member"),
  ...timestamps,
}, (table) => ({
  emailIdx: uniqueIndex("users_email_idx").on(table.email),
}));

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  ...timestamps,
});

export const invites = sqliteTable("invites", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  email: text("email"),
  note: text("note"),
  createdBy: text("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  usedBy: text("used_by").references(() => users.id, {
    onDelete: "set null",
  }),
  usedAt: text("used_at"),
  ...timestamps,
}, (table) => ({
  codeIdx: uniqueIndex("invites_code_idx").on(table.code),
}));

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  parentId: text("parent_id"),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
}, (table) => ({
  slugIdx: uniqueIndex("categories_slug_idx").on(table.parentId, table.slug),
  parentIdx: index("categories_parent_idx").on(table.parentId),
}));

/** Editorial cross-links between categories, e.g. "Философия математики" <-> "Математика". */
export const categoryRelations = sqliteTable("category_relations", {
  id: text("id").primaryKey(),
  categoryAId: text("category_a_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  categoryBId: text("category_b_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  label: text("label"),
  ...timestamps,
});

export const authors = sqliteTable("authors", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  bio: text("bio"),
  ...timestamps,
}, (table) => ({
  slugIdx: uniqueIndex("authors_slug_idx").on(table.slug),
}));

/** Relationships between authors, e.g. "писал о" Gödel, "ученик/учитель". */
export const authorRelations = sqliteTable("author_relations", {
  id: text("id").primaryKey(),
  authorAId: text("author_a_id")
    .notNull()
    .references(() => authors.id, { onDelete: "cascade" }),
  authorBId: text("author_b_id")
    .notNull()
    .references(() => authors.id, { onDelete: "cascade" }),
  label: text("label"),
  ...timestamps,
});

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  alternateTitle: text("alternate_title"),
  year: text("year"),
  description: text("description"),
  categoryId: text("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "restrict" }),
  fileUrl: text("file_url"),
  fileName: text("file_name"),
  fileType: text("file_type").notNull(),
  originalFormat: text("original_format"),
  pages: integer("pages"),
  confidence: text("confidence", { enum: ["confirmed", "low"] })
    .notNull()
    .default("confirmed"),
  sourceNote: text("source_note"),
  createdBy: text("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(current_timestamp)`),
  ...timestamps,
}, (table) => ({
  categoryIdx: index("documents_category_idx").on(table.categoryId),
}));

export const documentAuthors = sqliteTable("document_authors", {
  documentId: text("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  authorId: text("author_id")
    .notNull()
    .references(() => authors.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
}, (table) => ({
  pairIdx: uniqueIndex("document_authors_pair_idx").on(
    table.documentId,
    table.authorId,
  ),
}));

/** Change log for collaborative metadata editing (phase 1: history, not real-time). */
export const documentEdits = sqliteTable("document_edits", {
  id: text("id").primaryKey(),
  documentId: text("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  editorId: text("editor_id").references(() => users.id, {
    onDelete: "set null",
  }),
  field: text("field").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  ...timestamps,
});

/** Threaded comments; page = null is general discussion, page = N is a page-anchored note. */
export const comments = sqliteTable("comments", {
  id: text("id").primaryKey(),
  documentId: text("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  parentId: text("parent_id"),
  authorId: text("author_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  page: integer("page"),
  body: text("body").notNull(),
  updatedAt: text("updated_at"),
  ...timestamps,
}, (table) => ({
  documentIdx: index("comments_document_idx").on(table.documentId),
}));
