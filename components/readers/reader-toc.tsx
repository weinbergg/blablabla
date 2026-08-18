"use client";

export type ReaderTocItem = {
  id: string;
  label: string;
  hint?: string;
  active?: boolean;
};

export function ReaderToc({
  open,
  items,
  empty,
  onSelect,
}: {
  open: boolean;
  items: ReaderTocItem[];
  empty: string;
  onSelect: (id: string) => void;
}) {
  if (!open) return null;
  return (
    <aside className="mb-3 max-h-52 overflow-y-auto rounded-xl border border-ink/10 bg-paper p-2 md:mb-0 md:max-h-[min(70vh,44rem)] md:w-48 md:shrink-0 lg:w-56">
      <p className="mb-1 px-2 font-mono text-[10px] uppercase tracking-widest text-muted">
        Оглавление
      </p>
      {items.length > 0 ? (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`w-full rounded-lg px-2 py-1.5 text-left text-sm leading-5 hover:bg-ink/[0.04] ${
                  item.active ? "text-rust" : "text-ink"
                }`}
                onClick={() => onSelect(item.id)}
              >
                {item.label}
                {item.hint ? (
                  <span className="mt-0.5 block font-mono text-[10px] text-muted">{item.hint}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-2 py-1.5 text-sm leading-6 text-muted">{empty}</p>
      )}
    </aside>
  );
}
