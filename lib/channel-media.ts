import type Database from "better-sqlite3";
import type { PublicationBlock } from "./publication-content";

export const MEDIA_CATEGORIES = [ ["all", "Все"], ["photo", "Фото"], ["video", "Видео"], ["book", "Книги"], ["quote", "Цитаты"], ["file", "Файлы"] ] as const;
export type MediaCategory = typeof MEDIA_CATEGORIES[number][0];
export function channelMedia(db: Database.Database, channelId: string, category: MediaCategory, page = 1) {
  const rows = db.prepare(`WITH visible AS (
    SELECT p.*,c.slug AS channel_slug,c.kind FROM channel_posts p JOIN channels c ON c.id=p.channel_id
    WHERE p.channel_id=? AND p.published=1 AND p.deleted_at IS NULL AND c.archived=0
  ), items AS (
    SELECT p.id,p.slug,p.channel_slug,p.kind,p.title,p.created_at,j.value AS block FROM visible p,
      json_each(CASE WHEN json_valid(p.content_json) THEN json_extract(p.content_json,'$.blocks') ELSE '[]' END) j
    WHERE json_extract(j.value,'$.type') IN ('image','gallery','video','book','quote','file')
    UNION ALL
    SELECT p.id,p.slug,p.channel_slug,p.kind,p.title,p.created_at,
      CASE a.kind WHEN 'image' THEN json_object('id',a.id,'type','image','files',json_array(json_object('id',a.id,'caption',a.original_name)))
      WHEN 'video' THEN json_object('id',a.id,'type','video','fileId',a.id,'caption',a.original_name)
      ELSE json_object('id',a.id,'type','file','fileId',a.id,'label',a.original_name,'size',a.size,'mime',a.mime) END
    FROM visible p JOIN community_attachments a ON a.parent_type='channel_post' AND a.parent_id=p.id WHERE p.content_json IS NULL
    UNION ALL
    SELECT p.id,p.slug,p.channel_slug,p.kind,p.title,p.created_at,json_object('id','book','type','book','documentId',d.id,'title',d.title)
    FROM visible p JOIN documents d ON d.id=p.document_id WHERE p.content_json IS NULL
  ) SELECT * FROM items WHERE ?='all' OR (?='photo' AND json_extract(block,'$.type') IN ('image','gallery')) OR json_extract(block,'$.type')=?
    ORDER BY datetime(created_at) DESC,id DESC,json_extract(block,'$.id') LIMIT 25 OFFSET ?`).all(channelId, category, category, category, (page - 1) * 24) as { id: string; slug: string; channel_slug: string; kind: string; title: string; created_at: string; block: string }[];
  return { items: rows.slice(0, 24).map(row => ({ postId: row.id, title: row.title, href: row.kind === "news" ? `/news/${row.slug}` : `/channels/${row.channel_slug}/${row.slug}`, block: JSON.parse(row.block) as PublicationBlock })), hasMore: rows.length > 24 };
}
