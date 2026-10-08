/** Текст колонки: абзацы по пустой строке, без HTML и без «маркдаун-украшений». */
export function ChannelPostBody({ text }: { text: string }) {
  const blocks = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return (
    <div className="space-y-4 text-[1.05rem] leading-[1.7]">
      {blocks.map((block, index) => (
        <p key={`${index}-${block.slice(0, 24)}`} className="whitespace-pre-wrap">
          {block}
        </p>
      ))}
    </div>
  );
}
