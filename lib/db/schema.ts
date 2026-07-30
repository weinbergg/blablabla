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
  /** admin: full control · booster: trusted member, can also mark up files with stickers · member: read + general discussion only. */
  role: text("role", { enum: ["admin", "booster", "member"] })
    .notNull()
    .default("member"),
  /** Who invited this person (another user's id), resolved from the invite they registered with — the root of the referral tree. No FK constraint, same as comments.parentId, to avoid a self-reference cycle in the table definition. */
  referredBy: text("referred_by"),
  /** Cumulative moderation strikes; admins decide when enough is enough. */
  strikes: integer("strikes").notNull().default(0),
  status: text("status", { enum: ["active", "banned"] })
    .notNull()
    .default("active"),
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
  /** Primary language of the text, as a short code (ru/en/de/fr/la/grc/…) — free-form
   * rather than an enum since the library keeps growing into new languages. */
  language: text("language"),
  /** Set only for parallel/bilingual editions (e.g. Greek text with facing English
   * translation) — the *other* language alongside `language`. Null for monolingual texts. */
  secondaryLanguage: text("secondary_language"),
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

/** Secondary categories a document also belongs to, beyond its primary
 * `documents.categoryId` — e.g. a text on ancient mathematics can live
 * under "Математика" as its primary section while also being tagged into
 * "Философия → Античная философия" and "История". Used both to surface the
 * document in more than one part of the catalog and to draw extra
 * category↔category edges on the graph (two sections that share a work are
 * visibly related). */
export const documentCategories = sqliteTable("document_categories", {
  documentId: text("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  categoryId: text("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
}, (table) => ({
  pairIdx: uniqueIndex("document_categories_pair_idx").on(table.documentId, table.categoryId),
  categoryIdx: index("document_categories_category_idx").on(table.categoryId),
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

/** Free-form labels that cut across the category tree, e.g. "конспект", "перевод", "первоисточник". */
export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  ...timestamps,
}, (table) => ({
  slugIdx: uniqueIndex("tags_slug_idx").on(table.slug),
}));

export const documentTags = sqliteTable("document_tags", {
  documentId: text("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  tagId: text("tag_id")
    .notNull()
    .references(() => tags.id, { onDelete: "cascade" }),
}, (table) => ({
  pairIdx: uniqueIndex("document_tags_pair_idx").on(table.documentId, table.tagId),
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
  /** Set when this comment is a reply inside a specific sticker's discussion thread, rather than the page-level thread. */
  annotationId: text("annotation_id").references(() => annotations.id, {
    onDelete: "cascade",
  }),
  authorId: text("author_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  page: integer("page"),
  body: text("body").notNull(),
  updatedAt: text("updated_at"),
  ...timestamps,
}, (table) => ({
  documentIdx: index("comments_document_idx").on(table.documentId),
  annotationIdx: index("comments_annotation_idx").on(table.annotationId),
}));

/** Sticky-note style annotations pinned to a spot on a page: shape + colour + text, public or personal. */
export const annotations = sqliteTable("annotations", {
  id: text("id").primaryKey(),
  documentId: text("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  authorId: text("author_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  page: integer("page").notNull(),
  x: integer("x").notNull(),
  y: integer("y").notNull(),
  shape: text("shape", {
    enum: ["note", "star", "flag", "question", "heart", "quote", "formula", "drawing"],
  })
    .notNull()
    .default("note"),
  color: text("color").notNull().default("#c85c35"),
  body: text("body").notNull().default(""),
  visibility: text("visibility", { enum: ["public", "private"] })
    .notNull()
    .default("public"),
  /** Public annotations can additionally open a discussion thread — off by default so a plain sticker stays quiet. */
  allowDiscussion: integer("allow_discussion").notNull().default(0),
  /** Selected paragraph text captured when the annotation was placed, so the source passage can be looked up even if rects go stale. */
  anchorText: text("anchor_text"),
  /** JSON array of normalized (0..1000) rects for the selected text, used to briefly highlight the passage when the sticker is opened. */
  anchorRects: text("anchor_rects"),
  updatedAt: text("updated_at"),
  ...timestamps,
}, (table) => ({
  documentIdx: index("annotations_document_idx").on(table.documentId),
}));

export const reports = sqliteTable("reports", {
  id: text("id").primaryKey(),
  targetType: text("target_type", { enum: ["annotation", "comment"] }).notNull(),
  targetId: text("target_id").notNull(),
  documentId: text("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  reporterId: text("reporter_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  reason: text("reason").notNull().default(""),
  status: text("status", { enum: ["open", "resolved", "dismissed"] })
    .notNull()
    .default("open"),
  resolvedBy: text("resolved_by").references(() => users.id, { onDelete: "set null" }),
  resolvedAt: text("resolved_at"),
  ...timestamps,
}, (table) => ({
  statusIdx: index("reports_status_idx").on(table.status),
  targetIdx: index("reports_target_idx").on(table.targetType, table.targetId),
}));

/** A private conversation between two or more users — a DM or a small group
 * chat, entirely separate from the public per-document discussion threads
 * above. `title` is only used for a group (3+ participants); a 1:1 chat is
 * always labelled by the other participant's name in the UI instead. */
export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  title: text("title"),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
});

export const conversationParticipants = sqliteTable("conversation_participants", {
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Timestamp of the last message this participant has seen — everything
   * newer than this in the conversation counts as unread for them. */
  lastReadAt: text("last_read_at"),
  ...timestamps,
}, (table) => ({
  pairIdx: uniqueIndex("conversation_participants_pair_idx").on(table.conversationId, table.userId),
  userIdx: index("conversation_participants_user_idx").on(table.userId),
}));

export const directMessages = sqliteTable("direct_messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  authorId: text("author_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  // Millisecond precision (unlike the shared `timestamps` helper's
  // second-precision default) so a rapid back-and-forth in a chat still
  // orders correctly instead of tying on the same second.
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%d %H:%M:%f', 'now'))`),
}, (table) => ({
  conversationIdx: index("direct_messages_conversation_idx").on(table.conversationId),
}));

/** Free-standing questions/suggestions from readers — deliberately not tied to a document. */
export const feedback = sqliteTable("feedback", {
  id: text("id").primaryKey(),
  authorId: text("author_id").references(() => users.id, { onDelete: "set null" }),
  name: text("name"),
  contact: text("contact"),
  body: text("body").notNull(),
  status: text("status", { enum: ["new", "read", "resolved"] })
    .notNull()
    .default("new"),
  ...timestamps,
}, (table) => ({
  statusIdx: index("feedback_status_idx").on(table.status),
}));
