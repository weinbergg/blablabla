"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Flag,
  Heart,
  HelpCircle,
  Pencil,
  Quote,
  Sigma,
  Star,
  StickyNote,
} from "lucide-react";
import type { MyAnnotationRow } from "@/lib/db/queries";

const SHAPE_META: Record<
  string,
  { label: string; Icon: typeof StickyNote }
> = {
  note: { label: "Заметка", Icon: StickyNote },
  star: { label: "Важно", Icon: Star },
  flag: { label: "Флаг", Icon: Flag },
  question: { label: "Вопрос", Icon: HelpCircle },
  heart: { label: "Избранное", Icon: Heart },
  quote: { label: "Цитата", Icon: Quote },
  formula: { label: "Формула", Icon: Sigma },
  drawing: { label: "Рисунок", Icon: Pencil },
};

function previewBody(item: MyAnnotationRow) {
  if (item.shape === "drawing") return "Рисунок на странице";
  if (item.shape === "formula") return item.body.trim() || "Формула";
  const text = item.body.trim() || item.anchorText?.trim() || "Без текста";
  return text.length > 180 ? `${text.slice(0, 180)}…` : text;
}

export function NotesCatalog({ items }: { items: MyAnnotationRow[] }) {
  const [query, setQuery] = useState("");
  const [shape, setShape] = useState<string>("all");

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = items.filter((item) => {
      if (shape !== "all" && item.shape !== shape) return false;
      if (!q) return true;
      return (
        item.documentTitle.toLowerCase().includes(q) ||
        item.body.toLowerCase().includes(q) ||
        (item.anchorText ?? "").toLowerCase().includes(q)
      );
    });

    const map = new Map<
      string,
      { documentId: string; documentTitle: string; notes: MyAnnotationRow[] }
    >();
    for (const item of filtered) {
      const bucket = map.get(item.documentId) ?? {
        documentId: item.documentId,
        documentTitle: item.documentTitle,
        notes: [],
      };
      bucket.notes.push(item);
      map.set(item.documentId, bucket);
    }
    return [...map.values()].sort((a, b) =>
      a.documentTitle.localeCompare(b.documentTitle, "ru"),
    );
  }, [items, query, shape]);

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-ink/10 px-6 py-12 text-center">
        <p className="text-sm text-muted">
          Пометок пока нет. Откройте книгу и поставьте стикер на странице — он появится здесь.
        </p>
        <Link href="/#catalog" className="button-secondary mt-5 inline-flex">
          К каталогу
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по книге или тексту пометки…"
          className="w-full flex-1 rounded-xl border border-ink/15 bg-transparent px-3 py-2.5 text-sm outline-none focus:border-ink/40"
        />
        <select
          value={shape}
          onChange={(e) => setShape(e.target.value)}
          className="rounded-xl border border-ink/15 bg-transparent px-3 py-2.5 text-sm"
        >
          <option value="all">Все типы</option>
          {Object.entries(SHAPE_META).map(([key, meta]) => (
            <option key={key} value={key}>
              {meta.label}
            </option>
          ))}
        </select>
      </div>

      {grouped.length === 0 ? (
        <p className="text-sm text-muted">Ничего не найдено по этому фильтру.</p>
      ) : (
        grouped.map((group) => (
          <section
            key={group.documentId}
            className="overflow-hidden rounded-2xl border border-ink/10"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 bg-ink/[0.03] px-5 py-3.5">
              <div>
                <Link
                  href={`/documents/${group.documentId}`}
                  className="font-serif text-xl tracking-tight hover:text-rust"
                >
                  {group.documentTitle}
                </Link>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-muted">
                  {group.notes.length}{" "}
                  {group.notes.length === 1
                    ? "пометка"
                    : group.notes.length < 5
                      ? "пометки"
                      : "пометок"}
                </p>
              </div>
              <Link
                href={`/documents/${group.documentId}`}
                className="button-secondary !min-h-9 !text-xs"
              >
                Открыть книгу
              </Link>
            </div>
            <ul className="divide-y divide-ink/8">
              {group.notes.map((item) => {
                const meta = SHAPE_META[item.shape] ?? SHAPE_META.note;
                const Icon = meta.Icon;
                return (
                  <li key={item.id} className="px-5 py-3.5">
                    <Link
                      href={`/documents/${group.documentId}?page=${item.page}`}
                      className="group flex items-start gap-3"
                    >
                      <span
                        className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border-2 border-white shadow-sm"
                        style={{ backgroundColor: item.color }}
                      >
                        <Icon size={13} className="text-white" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                          <span className="font-medium text-ink/80">{meta.label}</span>
                          <span>· стр. {item.page}</span>
                          <span>· {item.visibility === "private" ? "лично" : "публично"}</span>
                          <span>
                            ·{" "}
                            {new Date(item.createdAt).toLocaleDateString("ru-RU", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        </span>
                        <span className="mt-1 block whitespace-pre-wrap text-sm leading-6 text-ink group-hover:text-rust">
                          {previewBody(item)}
                        </span>
                        {item.anchorText && item.body.trim() && (
                          <span className="mt-1 block truncate text-xs italic text-muted">
                            «{item.anchorText}»
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
