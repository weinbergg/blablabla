import type { ReactNode } from "react";
import { linkifyPlain } from "@/components/linked-text";

type Block =
  | { type: "p"; text: string }
  | { type: "h"; level: number; text: string }
  | { type: "quote"; text: string }
  | { type: "list"; items: string[] };

function renderInline(text: string, key: string): ReactNode {
  const chunks = text.split(/(\*\*[^*]+?\*\*)/g);
  return chunks.map((chunk, index) => {
    if (chunk.startsWith("**") && chunk.endsWith("**") && chunk.length > 4) {
      return (
        <strong key={`${key}-b-${index}`} className="font-semibold text-ink">
          {linkifyPlain(chunk.slice(2, -2), index)}
        </strong>
      );
    }
    return <span key={`${key}-t-${index}`}>{linkifyPlain(chunk, index)}</span>;
  });
}

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: string[] | null = null;

  function flushParagraph() {
    const text = paragraph.join(" ").trim();
    paragraph = [];
    if (text) blocks.push({ type: "p", text });
  }

  function flushList() {
    if (!list?.length) {
      list = null;
      return;
    }
    blocks.push({ type: "list", items: list });
    list = null;
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "h", level: heading[1].length, text: heading[2] });
      continue;
    }
    if (trimmed.startsWith(">")) {
      flushParagraph();
      flushList();
      blocks.push({ type: "quote", text: trimmed.replace(/^>\s?/, "") });
      continue;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      flushParagraph();
      list = list ?? [];
      list.push(trimmed.replace(/^[-*]\s+/, ""));
      continue;
    }
    flushList();
    paragraph.push(trimmed);
  }
  flushParagraph();
  flushList();
  return blocks;
}

/** Абзацы, заголовки, цитаты, списки и **жирное**. Ссылки остаются ссылками. HTML не принимается. */
export function ChannelPostBody({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className="space-y-4 text-[1.05rem] leading-[1.75] text-ink/90">
      {blocks.map((block, index) => {
        const key = `${index}-${block.type}`;
        if (block.type === "h") {
          const Tag = block.level === 1 ? "h2" : "h3";
          return (
            <Tag key={key} className={block.level === 1 ? "font-serif text-2xl tracking-tight text-ink" : "font-serif text-xl tracking-tight text-ink"}>
              {renderInline(block.text, key)}
            </Tag>
          );
        }
        if (block.type === "quote") {
          return (
            <blockquote key={key} className="border-l-2 border-ink/15 pl-4 text-muted">
              {renderInline(block.text, key)}
            </blockquote>
          );
        }
        if (block.type === "list") {
          return (
            <ul key={key} className="list-disc space-y-1.5 pl-5">
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={key} className="[overflow-wrap:anywhere]">
            {renderInline(block.text, key)}
          </p>
        );
      })}
    </div>
  );
}
