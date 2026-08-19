"use client";

export type ReaderTocItem = {
  id: string;
  label: string;
  hint?: string;
  active?: boolean;
  kind?: "contents";
};

export function ReaderToc({
  open,
  items,
  empty,
  onSelect,
  onClose,
}: {
  open: boolean;
  items: ReaderTocItem[];
  empty: string;
  onSelect: (id: string) => void;
  onClose?: () => void;
}) {
  if (!open) return null;
  return (
    <aside className="absolute inset-y-0 left-0 z-20 w-[min(24rem,calc(100%-1rem))] max-w-full overflow-hidden rounded-2xl border border-ink/10 bg-paper/95 shadow-xl backdrop-blur">
      <div className="flex items-center justify-between gap-3 border-b border-ink/8 px-3 py-2.5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted">Оглавление</p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 py-1 text-xs text-muted transition-colors hover:bg-ink/[0.04] hover:text-ink"
          >
            Скрыть
          </button>
        )}
      </div>
      <div className="max-h-full overflow-y-auto p-2">
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
                  {item.kind === "contents" ? (
                    <span className="mt-0.5 block font-mono text-[10px] text-rust">страница оглавления</span>
                  ) : item.hint ? (
                    <span className="mt-0.5 block font-mono text-[10px] text-muted">{item.hint}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-2 py-1.5 text-sm leading-6 text-muted">{empty}</p>
        )}
      </div>
    </aside>
  );
}
