export type RichNode = { type: string; text?: string; attrs?: Record<string, string | number>; marks?: { type: string; attrs?: { href: string } }[]; content?: RichNode[] };
export type TextAnchor = { version: 1; documentId: string; textVersion: string | null; exact: string; prefix: string; suffix: string; page: number; offset?: number; cfi?: string };
export function anchorHref(anchor: TextAnchor) {
  return `/documents/${encodeURIComponent(anchor.documentId)}?page=${anchor.page}#quote=${encodeURIComponent(JSON.stringify(anchor))}`;
}
type Base = { id: string };
export type PublicationBlock = Base & (
  | { type: "text"; doc: RichNode }
  | { type: "image" | "gallery"; files: { id: string; caption: string }[] }
  | { type: "file"; fileId: string; label: string; size?: number; mime?: string }
  | { type: "video"; fileId?: string; url?: string; caption: string }
  | { type: "book"; documentId: string; title?: string; authors?: string; cover?: string | null; format?: string; language?: string }
  | { type: "quote"; anchor: TextAnchor; comment: string; title?: string; authors?: string; format?: string }
  | { type: "link"; href: string; label: string; description: string; event?: { title: string; kind: string; startsAt: string | null; summary: string | null } }
  | { type: "repost"; postId: string; href?: string; label?: string }
  | { type: "divider" }
);
export type PublicationContent = { version: 1; blocks: PublicationBlock[] };

export function safeHref(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048 || /[\x00-\x20\\]/.test(value)) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try { const u = new URL(value); return ["https:", "http:"].includes(u.protocol) && !u.username && !u.password ? u.href : null; } catch { return null; }
}

export function videoEmbed(value: string): string | null {
  try {
    const u = new URL(value);
    if (!["https:", "http:"].includes(u.protocol)) return null;
    if (["youtube.com", "www.youtube.com", "youtu.be"].includes(u.hostname)) {
      const id = u.hostname === "youtu.be" ? u.pathname.slice(1) : u.searchParams.get("v") || u.pathname.split("/")[2];
      return id && /^[\w-]{11}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if (["vimeo.com", "www.vimeo.com"].includes(u.hostname) && /^\/\d+$/.test(u.pathname)) return `https://player.vimeo.com/video${u.pathname}`;
  } catch { /* show validation error in editor */ }
  return null;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Некорректный блок публикации");
  return value as Record<string, unknown>;
}
function str(value: unknown, limit: number, required = false) {
  if (typeof value !== "string" || value.length > limit || (required && !value.trim())) throw new Error("Проверьте текст и размер блока");
  return value;
}
export function validateAnchor(value: unknown): TextAnchor {
  const a = record(value);
  if (a.version !== 1 || !Number.isInteger(a.page) || Number(a.page) < 1 || Number(a.page) > 100000) throw new Error("Некорректная ссылка на фрагмент");
  const result: TextAnchor = { version: 1, documentId: str(a.documentId, 100, true), textVersion: a.textVersion == null ? null : str(a.textVersion, 128, true), exact: str(a.exact, 12000, true), prefix: str(a.prefix ?? "", 256), suffix: str(a.suffix ?? "", 256), page: Number(a.page) };
  if (a.offset !== undefined) { if (!Number.isInteger(a.offset) || Number(a.offset) < 0) throw new Error("Некорректная позиция"); result.offset = Number(a.offset); }
  if (a.cfi !== undefined) result.cfi = str(a.cfi, 2000, true);
  return result;
}
export function validateContent(value: unknown): PublicationContent {
  const input = record(value);
  if (input.version !== 1 || !Array.isArray(input.blocks) || input.blocks.length > 80 || JSON.stringify(value).length > 160000) throw new Error("Неподдерживаемая версия или слишком большая публикация");
  const ids = new Set<string>(); let nodes = 0;
  function rich(value: unknown, depth = 0): RichNode {
    const n = record(value);
    if (++nodes > 4000 || depth > 10 || !["doc", "paragraph", "heading", "text", "bulletList", "orderedList", "listItem", "blockquote", "horizontalRule", "hardBreak"].includes(String(n.type))) throw new Error("Неподдерживаемое форматирование");
    const clean: RichNode = { type: String(n.type) };
    if (n.type === "text") clean.text = str(n.text, 30000, true);
    if (n.type === "heading") clean.attrs = { level: record(n.attrs).level === 3 ? 3 : 2 };
    if (n.marks !== undefined) {
      if (!Array.isArray(n.marks) || n.marks.length > 6) throw new Error("Некорректное форматирование");
      clean.marks = n.marks.map(mark => {
        const m = record(mark); const type = String(m.type);
        if (!["bold", "italic", "strike", "underline", "code", "link"].includes(type)) throw new Error("Неподдерживаемое форматирование");
        if (type !== "link") return { type };
        const href = safeHref(record(m.attrs).href); if (!href) throw new Error("Некорректная ссылка");
        return { type, attrs: { href } };
      });
    }
    if (n.content !== undefined) { if (!Array.isArray(n.content)) throw new Error("Некорректный текст"); clean.content = n.content.map(child => rich(child, depth + 1)); }
    return clean;
  }
  return { version: 1, blocks: input.blocks.map(value => {
    const b = record(value); const id = str(b.id, 100, true);
    if (ids.has(id)) throw new Error("Повторяющийся блок"); ids.add(id);
    switch (b.type) {
      case "text": { const doc = rich(b.doc); if (doc.type !== "doc") throw new Error("Некорректный текст"); return { id, type: b.type, doc }; }
      case "divider": return { id, type: b.type };
      case "image": case "gallery": {
        if (!Array.isArray(b.files) || !b.files.length || b.files.length > 8) throw new Error("Выберите от 1 до 8 изображений");
        return { id, type: b.type, files: b.files.map(value => { const f = record(value); return { id: str(f.id, 100, true), caption: str(f.caption ?? "", 500) }; }) };
      }
      case "file": return { id, type: b.type, fileId: str(b.fileId, 100, true), label: str(b.label, 300, true) };
      case "video": {
        const caption = str(b.caption ?? "", 500);
        if (b.fileId) return { id, type: b.type, fileId: str(b.fileId, 100, true), caption };
        const url = str(b.url, 2048, true); if (!videoEmbed(url)) throw new Error("Нужна ссылка на видео YouTube или Vimeo");
        return { id, type: b.type, url, caption };
      }
      case "book": return { id, type: b.type, documentId: str(b.documentId, 100, true) };
      case "quote": return { id, type: b.type, anchor: validateAnchor(b.anchor), comment: str(b.comment ?? "", 4000) };
      case "link": { const href = safeHref(b.href); if (!href) throw new Error("Некорректная ссылка"); return { id, type: b.type, href, label: str(b.label, 200, true), description: str(b.description ?? "", 600) }; }
      case "repost": return { id, type: b.type, postId: str(b.postId, 100, true) };
      default: throw new Error("Неизвестный тип блока");
    }
  }) };
}

export function parseContent(json: string | null | undefined): PublicationContent | null {
  if (!json) return null;
  try { const value = JSON.parse(json); return value.version === 1 && Array.isArray(value.blocks) ? value : null; } catch { return null; }
}
export function richText(node: RichNode): string { return node.text ?? (node.content ?? []).map(richText).join(["doc", "bulletList", "orderedList"].includes(node.type) ? "\n" : ""); }
export function contentText(content: PublicationContent): string {
  return content.blocks.map(b => b.type === "text" ? richText(b.doc) : b.type === "quote" ? `${b.anchor.exact}\n${b.comment}` : b.type === "book" ? b.title || "Книга" : b.type === "link" ? `${b.label}\n${b.href}` : b.type === "file" ? b.label : b.type === "repost" ? "Репост" : b.type === "video" ? b.caption || "Видео" : b.type === "image" || b.type === "gallery" ? b.files.map(f => f.caption).join("\n") || "Изображение" : "").join("\n\n").trim();
}
export function contentAttachments(content: PublicationContent): string[] {
  return [...new Set(content.blocks.flatMap(b => b.type === "image" || b.type === "gallery" ? b.files.map(f => f.id) : (b.type === "video" || b.type === "file") && b.fileId ? [b.fileId] : []))];
}
export function plainDoc(text: string): RichNode { return { type: "doc", content: text.split(/\n\s*\n/).map(text => ({ type: "paragraph", content: text ? [{ type: "text", text }] : [] })) }; }

/** Preserve the existing publication formatting when an old body enters the editor. */
export function legacyDoc(source: string): RichNode {
  function inline(text: string): RichNode[] {
    const parts: RichNode[] = []; let offset = 0;
    const pattern = /\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)]+)\)/g;
    for (const match of text.matchAll(pattern)) {
      if (match.index! > offset) parts.push({ type: "text", text: text.slice(offset, match.index) });
      const href = match[4] ? safeHref(match[4]) : null;
      parts.push({ type: "text", text: match[1] ?? match[2] ?? (href ? match[3] : match[0]), ...((match[1] || match[2] || href) ? { marks: [{ type: match[1] ? "bold" : match[2] ? "italic" : "link", ...(href ? { attrs: { href } } : {}) }] } : {}) });
      offset = match.index! + match[0].length;
    }
    if (offset < text.length) parts.push({ type: "text", text: text.slice(offset) });
    return parts;
  }
  const nodes: RichNode[] = []; let paragraph: string[] = [];
  function flush() { if (paragraph.length) nodes.push({ type: "paragraph", content: inline(paragraph.join(" ")) }); paragraph = []; }
  for (const line of source.replace(/\r\n/g, "\n").split("\n")) {
    const text = line.trim(); const heading = /^(#{1,3})\s+(.+)$/.exec(text); const list = /^[-*]\s+(.+)$/.exec(text);
    if (!text) { flush(); continue; }
    if (heading) { flush(); nodes.push({ type: "heading", attrs: { level: heading[1].length === 3 ? 3 : 2 }, content: inline(heading[2]) }); }
    else if (text.startsWith(">")) { flush(); nodes.push({ type: "blockquote", content: [{ type: "paragraph", content: inline(text.replace(/^>\s?/, "")) }] }); }
    else if (list) { flush(); let parent = nodes.at(-1); if (parent?.type !== "bulletList") { parent = { type: "bulletList", content: [] }; nodes.push(parent); } parent.content!.push({ type: "listItem", content: [{ type: "paragraph", content: inline(list[1]) }] }); }
    else paragraph.push(text);
  }
  flush(); return { type: "doc", content: nodes.length ? nodes : [{ type: "paragraph" }] };
}
