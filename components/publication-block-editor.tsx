"use client";
import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowDown, ArrowUp, BookOpen, FileText, ImagePlus, Link2, Minus, Plus, Quote, Trash2, Type, Video, X } from "lucide-react";
import { BookCover } from "./book-cover";
import { SavedQuotePicker } from "./saved-quote-picker";
import { PublicationFile, PublicationVideo } from "./publication-media";
import { AttachmentPicker, type PickedFile } from "./attachment-picker";
import { LibraryBookPicker, type LibraryBook } from "./library-book-picker";
import { plainDoc, safeHref, videoEmbed, type PublicationBlock, type PublicationContent } from "@/lib/publication-content";
const RichEditor = dynamic(() => import("./publication-rich-editor").then(m => m.PublicationRichEditor), { ssr: false, loading: () => <p className="py-6 text-sm text-muted">Загружаем редактор…</p> });

export function PublicationBlockEditor({ content, onChange }: { content: PublicationContent; onChange: (value: PublicationContent) => void }) {
  const [insert, setInsert] = useState<"book" | "quote" | "media" | "video" | "file" | "saved" | "link" | null>(null);
  const [book, setBook] = useState<LibraryBook | null>(null); const [text, setText] = useState(""); const [url, setUrl] = useState(""); const [label, setLabel] = useState(""); const [page, setPage] = useState(1);
  const [pendingFiles, setPendingFiles] = useState<PickedFile[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [quoteMode, setQuoteMode] = useState<"saved" | "manual">("saved");
  const [uploadError, setUploadError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const blocks = content.blocks;
  function change(block: PublicationBlock) { onChange({ version: 1, blocks: blocks.map(b => b.id === block.id ? block : b) }); }
  function add(block: PublicationBlock) { onChange({ version: 1, blocks: [...blocks, block] }); dialog.current?.close(); setInsert(null); }
  function open(kind: typeof insert) { setPendingFiles([]); setQuoteMode("saved"); setUploadError(""); setBook(null); setText(""); setUrl(""); setLabel(""); setPage(1); setInsert(kind); dialog.current?.showModal(); }
  function move(index: number, direction: number) { const next = [...blocks]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; onChange({ version: 1, blocks: next }); }
  function close() {
    if (uploadBusy || (pendingFiles.length && !window.confirm("Закрыть выбор без добавления загруженных файлов в публикацию?"))) return;
    dialog.current?.close(); setPendingFiles([]);
  }
  function insertFiles() {
    const pictures = pendingFiles.filter(f => f.kind === "image"), next: PublicationBlock[] = [];
    if (pictures.length) next.push({ id: crypto.randomUUID(), type: pictures.length > 1 ? "gallery" : "image", files: pictures.map(f => ({ id: f.id, caption: "" })) });
    for (const f of pendingFiles) {
      if (f.kind === "video") next.push({ id: crypto.randomUUID(), type: "video", fileId: f.id, caption: "" });
      if (f.kind === "file") next.push({ id: crypto.randomUUID(), type: "file", fileId: f.id, label: f.name, size: f.size, mime: f.mime });
    }
    onChange({ version: 1, blocks: [...blocks, ...next] }); setPendingFiles([]); dialog.current?.close();
  }
  return <div>
    {uploadError && <p role="alert" className="mb-5 text-sm text-rust">{uploadError}</p>}
    <div className="space-y-8">
      {blocks.map((block, index) => <section key={block.id} className="group/block relative border-b border-ink/10 pb-7" aria-label={`Блок ${index + 1}`}>
        <div className="mb-3 flex items-center justify-between gap-3 text-xs text-muted"><span>{({ text: "Текст", book: "Книга", quote: "Цитата из книги", image: "Изображение", gallery: "Галерея", video: "Видео", link: "Ссылка", divider: "Разделитель", repost: "Репост", file: "Файл" })[block.type]}</span><div className="flex gap-1"><button type="button" aria-label="Переместить блок выше" disabled={index === 0} className="p-2 disabled:opacity-25 hover:text-rust" onClick={() => move(index, -1)}><ArrowUp size={15} /></button><button type="button" aria-label="Переместить блок ниже" disabled={index === blocks.length - 1} className="p-2 disabled:opacity-25 hover:text-rust" onClick={() => move(index, 1)}><ArrowDown size={15} /></button><button type="button" aria-label="Удалить блок" className="p-2 hover:text-rust" onClick={() => { if (window.confirm("Убрать этот блок из публикации?")) onChange({ version: 1, blocks: blocks.filter(b => b.id !== block.id) }); }}><Trash2 size={15} /></button></div></div>
        {block.type === "text" && <RichEditor value={block.doc} onChange={doc => change({ ...block, doc })} />}
        {block.type === "book" && <div className="flex gap-4 bg-rust/5 p-5"><BookCover documentId={block.documentId} /><div><p className="font-serif text-xl">{block.title || "Книга из библиотеки"}</p><p className="mt-1 text-sm text-muted">{block.authors}</p></div></div>}
        {block.type === "quote" && <div className="border-l-2 border-rust pl-5"><p className="mb-3 text-sm text-muted">{block.title} · {block.format === "epub" || block.anchor.cfi ? "глава" : "страница / раздел"} {block.anchor.page}</p><textarea aria-label="Цитата из произведения" className="w-full resize-y bg-transparent font-serif text-xl leading-8 outline-none" rows={4} value={block.anchor.exact} onChange={e => change({ ...block, anchor: { ...block.anchor, exact: e.target.value, textVersion: null, offset: undefined, cfi: undefined } })} /><textarea aria-label="Комментарий к цитате" className="mt-4 w-full bg-transparent text-base leading-7 outline-none" placeholder="Ваш комментарий к фрагменту…" rows={2} value={block.comment} onChange={e => change({ ...block, comment: e.target.value })} /></div>}
        {(block.type === "image" || block.type === "gallery") && <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{block.files.map((file, i) => <div key={file.id}>{/* Authenticated files must use the browser session, without the image optimizer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/community/files/${file.id}`} alt={file.caption} className="h-44 w-full object-contain bg-ink/3" /><input aria-label={`Подпись изображения ${i + 1}`} placeholder="Подпись к изображению" value={file.caption} maxLength={500} className="mt-2 w-full border-b border-ink/10 bg-transparent py-2 text-sm" onChange={e => change({ ...block, files: block.files.map(f => f.id === file.id ? { ...f, caption: e.target.value } : f) })} />
      <div className="mt-1 flex items-center justify-between text-xs text-muted"><span>Фото {i + 1} из {block.files.length}</span><div className="flex">
        <button type="button" className="p-3 disabled:opacity-25" aria-label={`Изображение ${i + 1}: раньше`} disabled={i === 0} onClick={() => { const files = [...block.files]; [files[i - 1], files[i]] = [files[i], files[i - 1]]; change({ ...block, files }); }}><ArrowUp size={14} /></button>
        <button type="button" className="p-3 disabled:opacity-25" aria-label={`Изображение ${i + 1}: позже`} disabled={i === block.files.length - 1} onClick={() => { const files = [...block.files]; [files[i + 1], files[i]] = [files[i], files[i + 1]]; change({ ...block, files }); }}><ArrowDown size={14} /></button>
        <button type="button" className="p-3 hover:text-rust" aria-label={`Убрать изображение ${i + 1}`} onClick={() => { const files = block.files.filter(f => f.id !== file.id); if (files.length) change({ ...block, type: files.length > 1 ? "gallery" : "image", files }); else onChange({ version: 1, blocks: blocks.filter(b => b.id !== block.id) }); }}><X size={14} /></button>
      </div></div></div>)}</div>}
        {block.type === "video" && <div>{block.fileId && <PublicationVideo fileId={block.fileId} caption={block.caption} />}<p className="break-all text-sm text-muted">{block.fileId ? "Загруженное видео" : block.url}</p><input className="mt-3 w-full border-b border-ink/15 bg-transparent py-2" aria-label="Подпись видео" placeholder="Подпись к видео" value={block.caption} onChange={e => change({ ...block, caption: e.target.value })} /></div>}
        {block.type === "link" && <div><input className="w-full bg-transparent font-serif text-xl" aria-label="Название ссылки" value={block.label} onChange={e => change({ ...block, label: e.target.value })} /><p className="mt-2 break-all text-sm text-muted">{block.href}</p><textarea className="mt-3 w-full bg-transparent text-sm" placeholder="Краткое описание" aria-label="Описание ссылки" value={block.description} onChange={e => change({ ...block, description: e.target.value })} /></div>}
        {block.type === "divider" && <hr className="my-4 border-ink/30" />}
        {block.type === "file" && <PublicationFile {...block} />}
        {block.type === "repost" && <p className="text-sm text-muted">Ссылка на исходную публикацию сохраняется вместе с вашим комментарием.</p>}
      </section>)}
    </div>
    <div className="mt-6 border border-dashed border-ink/20 p-4"><p className="mb-3 flex items-center gap-2 text-xs uppercase tracking-widest text-muted"><Plus size={14} /> Добавить в публикацию</p><div className="flex flex-wrap gap-2">
      {[{ label: "Текст", icon: Type, action: () => add({ id: crypto.randomUUID(), type: "text", doc: plainDoc("") }) }, { label: "Книга", icon: BookOpen, action: () => open("book") }, { label: "Цитата", icon: Quote, action: () => open("quote") }, { label: "Фото", icon: ImagePlus, action: () => open("media") }, { label: "Файл", icon: FileText, action: () => open("file") }, { label: "С пометкой", icon: Quote, action: () => open("saved") }, { label: "Видео", icon: Video, action: () => open("video") }, { label: "Ссылка", icon: Link2, action: () => open("link") }, { label: "Разделитель", icon: Minus, action: () => add({ id: crypto.randomUUID(), type: "divider" }) }].map(item => <button type="button" key={item.label} className="inline-flex items-center gap-2 px-3 py-2 text-sm hover:bg-ink/5" onClick={item.action}><item.icon size={16} />{item.label}</button>)}
    </div></div>
    <dialog ref={dialog} className="publication-dialog" onClose={() => setInsert(null)} onCancel={e => { e.preventDefault(); close(); }}><div className="flex items-start justify-between gap-3"><h2 className="font-serif text-2xl">{insert === "book" ? "Книга из библиотеки" : insert === "quote" ? "Цитата с источником" : insert === "media" ? "Фотографии" : insert === "file" ? "Файлы" : insert === "saved" ? "Мои фрагменты с пометками" : insert === "video" ? "Видео" : "Добавить ссылку"}</h2><button type="button" aria-label="Закрыть" className="p-2" onClick={close} disabled={uploadBusy}><X size={19} /></button></div>
      {insert === "quote" && <div className="mt-5 flex flex-wrap gap-2 border-b border-ink/15 pb-3">{([ ["saved", "Мои фрагменты"], ["manual", "Указать источник"] ] as const).map(([mode, title]) => <button key={mode} type="button" className={`px-3 py-2 text-sm ${quoteMode === mode ? "bg-ink text-paper" : "text-muted"}`} onClick={() => setQuoteMode(mode)}>{title}</button>)}</div>}
      {(insert === "saved" || insert === "quote" && quoteMode === "saved") && <SavedQuotePicker onSelect={add} />}
      {(insert === "book" || insert === "quote" && quoteMode === "manual") && !book && <LibraryBookPicker onSelect={b => { if (insert === "book") add({ id: crypto.randomUUID(), type: "book", documentId: b.id, title: b.title, authors: b.authorNames, format: b.format, language: b.language }); else setBook(b); }} />}
      {insert === "quote" && quoteMode === "manual" && book && <div className="mt-5 space-y-4"><p className="text-sm text-muted">{book.title}</p><label className="field"><span>Точная цитата</span><textarea value={text} onChange={e => setText(e.target.value)} rows={5} maxLength={12000} /></label><label className="field"><span>Страница / раздел</span><input type="number" min={1} max={100000} value={page} onChange={e => setPage(Number(e.target.value))} /></label><button type="button" className="button-primary" disabled={!text.trim() || page < 1} onClick={() => add({ id: crypto.randomUUID(), type: "quote", title: book.title, authors: book.authorNames, format: book.format, comment: "", anchor: { version: 1, documentId: book.id, textVersion: null, exact: text, prefix: "", suffix: "", page } })}>Вставить цитату</button></div>}
      {(insert === "media" || insert === "video" || insert === "file") && <div className="mt-5 space-y-4"><p className="text-sm leading-6 text-muted">{insert === "media" ? "До 8 фотографий. Выберите порядок, затем добавьте подписи в публикации." : insert === "video" ? "Загрузите MP4 или WebM до 64 МБ. Или добавьте ссылку на внешний плеер ниже." : "PDF, EPUB, TXT или ZIP. Страницу с пометками можно сохранить в читалке как PDF и прикрепить здесь."}</p><AttachmentPicker files={pendingFiles} onBusyChange={setUploadBusy} onUploadError={setUploadError} accept={insert === "media" ? "image/jpeg,image/png,image/gif,image/webp" : insert === "video" ? "video/mp4,video/webm" : "application/pdf,.epub,.txt,.zip"} onChange={setPendingFiles} />{!!pendingFiles.length && <button type="button" className="button-primary" disabled={uploadBusy} onClick={insertFiles}>Добавить в публикацию ({pendingFiles.length})</button>}</div>}
      {(insert === "link" || insert === "video") && <div className="mt-5 space-y-4"><label className="field"><span>{insert === "video" ? "YouTube или Vimeo" : "Адрес страницы"}</span><input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" /></label>{insert === "link" && <label className="field"><span>Название</span><input value={label} onChange={e => setLabel(e.target.value)} maxLength={200} /></label>}{insert === "link" && <p className="text-xs leading-6 text-muted">Ссылка на открытую читательскую комнату появится в ленте как анонс с программой и временем встречи.</p>}<button type="button" className="button-primary" disabled={uploadBusy || pendingFiles.length > 0 || (insert === "video" ? !videoEmbed(url) : !safeHref(url) || !label.trim())} onClick={() => add(insert === "video" ? { id: crypto.randomUUID(), type: "video", url, caption: "" } : { id: crypto.randomUUID(), type: "link", href: (() => { const link = new URL(url, location.origin); return link.origin === location.origin ? link.pathname + link.search + link.hash : url; })(), label, description: "" })}>Добавить</button></div>}
    </dialog>
  </div>;
}
