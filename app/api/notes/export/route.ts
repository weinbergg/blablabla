import { NextResponse } from "next/server";
import { getMyAnnotations, type MyAnnotationRow } from "@/lib/db/queries";
import { contentDisposition } from "@/lib/file-serve";
import { requireFeature } from "@/lib/feature-guard";
import { safeZipName } from "@/lib/zip-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * «Экспорт заметок в Markdown» — фича читательского билета.
 *
 * Отдаём один .md: заметки сгруппированы по книгам, внутри — по страницам.
 * Markdown выбран потому, что его одинаково понимают Obsidian, Notion, Typora
 * и обычный блокнот, а ссылки назад в библиотеку остаются кликабельными.
 *
 * ?document=<id> — выгрузить заметки только по одной книге (кнопка в читалке).
 */

const SHAPE_LABELS: Record<string, string> = {
  note: "заметка",
  star: "важное",
  flag: "вернуться",
  question: "вопрос",
  heart: "любимое",
  quote: "цитата",
  formula: "формула",
  drawing: "рисунок",
};

/** Цитату показываем блоком, чтобы отличать текст книги от своих слов. */
function quoteBlock(text: string) {
  return text
    .trim()
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function renderNote(note: MyAnnotationRow, origin: string) {
  const lines: string[] = [];
  const label = SHAPE_LABELS[note.shape] ?? note.shape;
  const privacy = note.visibility === "private" ? ", личная" : "";
  lines.push(`### Страница ${note.page} — ${label}${privacy}`);
  lines.push("");
  if (note.anchorText?.trim()) {
    lines.push(quoteBlock(note.anchorText));
    lines.push("");
  }
  if (note.body.trim()) {
    lines.push(note.body.trim());
    lines.push("");
  }
  if (note.companionDocumentId && note.companionTitle) {
    lines.push(
      `Параллельное место: [${note.companionTitle}](${origin}/documents/${note.companionDocumentId}?page=${note.companionPage ?? 1})`,
    );
    lines.push("");
  }
  lines.push(
    `[Открыть в библиотеке](${origin}/documents/${note.documentId}?page=${note.page}) · ${new Date(note.createdAt).toLocaleDateString("ru-RU")}`,
  );
  lines.push("");
  return lines.join("\n");
}

export async function GET(request: Request) {
  const guard = await requireFeature("notes.export");
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const documentFilter = url.searchParams.get("document");
  const all = await getMyAnnotations(guard.context.user.id);
  const notes = documentFilter ? all.filter((note) => note.documentId === documentFilter) : all;

  if (notes.length === 0) {
    return NextResponse.json({ error: "Заметок пока нет" }, { status: 404 });
  }

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "blablablarden.ru";
  const protocol = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  const origin = `${protocol}://${host}`;

  const byDocument = new Map<string, MyAnnotationRow[]>();
  for (const note of notes) {
    const list = byDocument.get(note.documentId);
    if (list) list.push(note);
    else byDocument.set(note.documentId, [note]);
  }

  const sections: string[] = [
    `# Заметки — ${guard.context.user.name}`,
    "",
    `Выгружено ${new Date().toLocaleString("ru-RU")} · всего ${notes.length}`,
    "",
  ];

  for (const [documentId, list] of byDocument) {
    const sorted = [...list].sort((left, right) => left.page - right.page);
    sections.push(`## [${sorted[0].documentTitle}](${origin}/documents/${documentId})`);
    sections.push("");
    for (const note of sorted) sections.push(renderNote(note, origin));
  }

  const title = documentFilter ? notes[0].documentTitle : "Заметки";
  const fileName = `${safeZipName(title, "Заметки")}.md`;

  return new NextResponse(sections.join("\n"), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": contentDisposition("download", fileName),
      "Cache-Control": "private, no-store",
    },
  });
}
