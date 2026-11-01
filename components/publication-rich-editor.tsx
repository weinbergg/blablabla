"use client";

import { useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, List, ListOrdered, Heading2, Quote, Link2, Undo2, Redo2 } from "lucide-react";
import { safeHref, type RichNode } from "@/lib/publication-content";

export function PublicationRichEditor({ value, onChange }: { value: RichNode; onChange: (value: RichNode) => void }) {
  const change = useRef(onChange); change.current = onChange;
  const [link, setLink] = useState<string | null>(null);
  const editor = useEditor({
    extensions: [StarterKit.configure({ codeBlock: false, heading: { levels: [2, 3] }, link: { openOnClick: false, protocols: ["http", "https"] } })],
    content: value, immediatelyRender: false, shouldRerenderOnTransaction: true,
    editorProps: { attributes: { class: "publication-prose min-h-32 outline-none", "aria-label": "Текст публикации", role: "textbox", "aria-multiline": "true" } },
    onUpdate: ({ editor }) => change.current(editor.getJSON() as RichNode),
  });
  if (!editor) return <div className="h-32 animate-pulse bg-ink/3" aria-label="Загрузка редактора" />;
  const tools = [
    { label: "Жирный", icon: Bold, active: editor.isActive("bold"), run: () => editor.chain().focus().toggleBold().run() },
    { label: "Курсив", icon: Italic, active: editor.isActive("italic"), run: () => editor.chain().focus().toggleItalic().run() },
    { label: "Заголовок", icon: Heading2, active: editor.isActive("heading"), run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { label: "Список", icon: List, active: editor.isActive("bulletList"), run: () => editor.chain().focus().toggleBulletList().run() },
    { label: "Нумерация", icon: ListOrdered, active: editor.isActive("orderedList"), run: () => editor.chain().focus().toggleOrderedList().run() },
    { label: "Цитата", icon: Quote, active: editor.isActive("blockquote"), run: () => editor.chain().focus().toggleBlockquote().run() },
    { label: "Ссылка", icon: Link2, active: editor.isActive("link"), run: () => setLink(editor.getAttributes("link").href || "") },
    { label: "Отменить", icon: Undo2, active: false, run: () => editor.chain().focus().undo().run() },
    { label: "Повторить", icon: Redo2, active: false, run: () => editor.chain().focus().redo().run() },
  ];
  return <div>
    <div className="mb-4 flex flex-wrap gap-1 border-b border-ink/10 pb-2" role="toolbar" aria-label="Форматирование текста">
      {tools.map(t => <button key={t.label} type="button" title={t.label} aria-label={t.label} aria-pressed={t.active} onClick={t.run} className={`p-2.5 transition-colors ${t.active ? "bg-rust/10 text-rust" : "text-muted hover:bg-ink/5 hover:text-ink"}`}><t.icon size={17} /></button>)}
    </div>
    {link !== null && <div className="mb-4 flex flex-wrap gap-2"><input aria-label="Адрес ссылки" className="min-w-0 flex-1 border border-ink/20 p-2 text-sm" value={link} onChange={e => setLink(e.target.value)} placeholder="https://… или /documents/…" /><button type="button" className="button-secondary" disabled={!!link && !safeHref(link)} onClick={() => { if (link) editor.chain().focus().extendMarkRange("link").setLink({ href: safeHref(link)! }).run(); else editor.chain().focus().unsetLink().run(); setLink(null); }}>Применить</button><button type="button" className="text-sm" onClick={() => setLink(null)}>Отмена</button></div>}
    <EditorContent editor={editor} />
  </div>;
}
