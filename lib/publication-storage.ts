import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { contentAttachments, contentText, validateContent, type PublicationContent } from "./publication-content";
import { slugify } from "./transliterate";

export class RevisionConflict extends Error {}
type Stored = { id: string; slug: string; channel_id: string; author_id: string; revision: number; content_json: string | null; body: string; title: string; published: number; document_id: string | null };
export type PublicationInput = { title?: unknown; body?: unknown; content?: unknown; documentId?: unknown; published?: unknown; pinned?: unknown; commentsOpen?: unknown; revision?: unknown; clientKey?: unknown; attachmentIds?: unknown };

/** Single transaction for post + files; reused by existing channels APIs. */
export function savePublication(db: Database.Database, channelId: string, authorId: string, input: PublicationInput, postId?: string) {
  return db.transaction(() => {
    const old = postId ? db.prepare("SELECT * FROM channel_posts WHERE id=? AND channel_id=? AND deleted_at IS NULL").get(postId, channelId) as Stored | undefined : undefined;
    if (postId && !old) throw new Error("Публикация не найдена");
    const key = typeof input.clientKey === "string" && /^[\w-]{8,100}$/.test(input.clientKey) ? input.clientKey : null;
    if (!old && key) {
      const duplicate = db.prepare("SELECT id,slug,revision FROM channel_posts WHERE channel_id=? AND author_id=? AND client_key=?").get(channelId, authorId, key) as { id: string; slug: string; revision: number } | undefined;
      if (duplicate) return { ...duplicate, duplicate: true };
    }
    if (old && input.revision !== undefined && input.revision !== old.revision) throw new RevisionConflict("Запись изменена в другом окне. Ваш текст сохранён локально; обновите страницу и сравните версии.");
    for (const flag of ["published", "pinned", "commentsOpen"] as const) if (input[flag] !== undefined && typeof input[flag] !== "boolean") throw new Error("Некорректные настройки публикации");
    if (old && (input.pinned !== undefined || input.commentsOpen !== undefined) && Object.keys(input).every(key => ["revision", "pinned", "commentsOpen"].includes(key))) {
      // Moderation must preserve legacy bodies and media-only publications verbatim.
      if (input.pinned !== undefined) db.prepare("UPDATE channel_posts SET pinned=? WHERE id=?").run(Number(input.pinned), old.id);
      if (input.commentsOpen !== undefined) db.prepare("UPDATE channel_posts SET comments_open=? WHERE id=?").run(Number(input.commentsOpen), old.id);
      db.prepare("UPDATE channel_posts SET revision=revision+1,updated_at=? WHERE id=?").run(new Date().toISOString(), old.id);
      return { id: old.id, slug: old.slug, revision: old.revision + 1, duplicate: false, published: Boolean(old.published) };
    }
    const id = old?.id ?? randomUUID();
    let content: PublicationContent | null = null;
    if (input.content !== undefined) {
      content = validateContent(input.content);
      for (const block of content.blocks) {
        if (block.type === "book" || block.type === "quote") {
          const documentId = block.type === "book" ? block.documentId : block.anchor.documentId;
          const book = db.prepare("SELECT id,title,file_type AS format,language FROM documents WHERE id=?").get(documentId) as { id: string; title: string; format: string; language: string } | undefined;
          if (!book) throw new Error("Книга не найдена в библиотеке");
          block.title = book.title; block.format = book.format?.toLowerCase();
          if (block.type === "book") block.language = book.language;
          block.authors = (db.prepare("SELECT a.name FROM authors a JOIN document_authors da ON da.author_id=a.id WHERE da.document_id=?").all(documentId) as { name: string }[]).map(a => a.name).join(", ");
        }
        if (block.type === "repost") {
          const source = db.prepare("SELECT p.slug,c.slug AS channel_slug,c.kind FROM channel_posts p JOIN channels c ON c.id=p.channel_id WHERE p.id=? AND p.published=1 AND p.deleted_at IS NULL AND c.archived=0").get(block.postId) as { slug: string; channel_slug: string; kind: string } | undefined;
          if (!source || block.postId === id) throw new Error("Исходная публикация недоступна");
          block.href = source.kind === "news" ? `/news/${source.slug}` : `/channels/${source.channel_slug}/${source.slug}`;
          block.label = "Открыть исходную публикацию";
        }
      }
    }
    const text = content ? contentText(content) : input.body === undefined ? old?.body ?? "" : typeof input.body === "string" ? input.body.trim() : "";
    if (text.length > 60000) throw new Error("Текст превышает 60 000 символов");
    const published = input.published === undefined ? old?.published ?? 1 : Number(input.published);
    if (published && text.length < 1) throw new Error("Добавьте текст, книгу или медиа перед публикацией");
    const title = typeof input.title === "string" ? input.title.trim() : old?.title ?? "";
    if (title.length > 160) throw new Error("Заголовок не должен превышать 160 символов");
    const displayTitle = title || text.slice(0, 80).split("\n")[0] || "Без названия";
    const linkedBook = content?.blocks.find(b => b.type === "book" || b.type === "quote");
    const documentId = linkedBook?.type === "book" ? linkedBook.documentId : linkedBook?.type === "quote" ? linkedBook.anchor.documentId : content ? null : input.documentId === undefined ? old?.document_id ?? null : input.documentId;
    if (documentId !== null && (typeof documentId !== "string" || !db.prepare("SELECT id FROM documents WHERE id=?").get(documentId))) throw new Error("Книга не найдена");
    let ids: string[] = [];
    if (content) ids = contentAttachments(content);
    else if (input.attachmentIds !== undefined) {
      if (!Array.isArray(input.attachmentIds) || input.attachmentIds.some(id => typeof id !== "string")) throw new Error("Некорректные вложения");
      ids = [...new Set(input.attachmentIds as string[])];
    }
    if (ids.length > 24) throw new Error("В публикации может быть не больше 24 файлов");
    for (const fileId of ids) {
      const file = db.prepare("SELECT owner_id,parent_id,parent_type,kind,size,mime FROM community_attachments WHERE id=?").get(fileId) as { owner_id: string; parent_id: string | null; parent_type: string | null; kind: string; size: number; mime: string } | undefined;
      if (!file || !((file.parent_id === id && file.parent_type === "channel_post") || (!file.parent_id && file.owner_id === authorId))) throw new Error("Нет доступа к одному из вложений");
      for (const block of content?.blocks ?? []) if (block.type === "file" && block.fileId === fileId) { block.size = file.size; block.mime = file.mime; }
      if (content?.blocks.some(b => (b.type === "image" || b.type === "gallery") && b.files.some(f => f.id === fileId)) && file.kind !== "image") throw new Error("Для галереи нужно изображение");
      if (content?.blocks.some(b => b.type === "video" && b.fileId === fileId) && file.kind !== "video") throw new Error("Выберите видеофайл");
    }
    const revision = (old?.revision ?? 0) + 1;
    const now = new Date().toISOString();
    const contentJson = content ? JSON.stringify(content) : input.body !== undefined ? null : old?.content_json ?? null;
    const slug = old?.slug ?? `${slugify(displayTitle).slice(0, 70) || "zapis"}-${id.slice(0, 8)}`;
    if (old) {
      db.prepare("UPDATE channel_posts SET title=?,body=?,content_json=?,document_id=?,published=?,revision=?,updated_at=? WHERE id=?").run(displayTitle, text, contentJson, documentId, published, revision, now, id);
    } else {
      const recent = db.prepare("SELECT count(*) AS n FROM channel_posts WHERE author_id=? AND datetime(created_at) > datetime('now','-1 day')").get(authorId) as { n: number };
      if (recent.n >= 60) throw new Error("Достигнут дневной лимит новых записей");
      db.prepare("INSERT INTO channel_posts(id,channel_id,author_id,slug,title,body,content_json,document_id,published,revision,client_key,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(id, channelId, authorId, slug, displayTitle, text, contentJson, documentId, published, revision, key, now);
    }
    if (input.pinned !== undefined) db.prepare("UPDATE channel_posts SET pinned=? WHERE id=?").run(Number(input.pinned), id);
    if (input.commentsOpen !== undefined) db.prepare("UPDATE channel_posts SET comments_open=? WHERE id=?").run(Number(input.commentsOpen), id);
    if (content || input.attachmentIds !== undefined) {
      // Removed files become private unbound uploads; never delete their bytes.
      const existing = db.prepare("SELECT id FROM community_attachments WHERE parent_type='channel_post' AND parent_id=?").all(id) as { id: string }[];
      for (const file of existing) if (!ids.includes(file.id)) db.prepare("UPDATE community_attachments SET parent_type=NULL,parent_id=NULL WHERE id=?").run(file.id);
      for (const fileId of ids) db.prepare("UPDATE community_attachments SET parent_type='channel_post',parent_id=? WHERE id=?").run(id, fileId);
    }
    return { id, slug, revision, duplicate: false, published: Boolean(published) };
  }).immediate();
}
