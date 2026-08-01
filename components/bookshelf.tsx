"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { spineAccent } from "@/lib/category-style";
import { LIBRARY_STATUS_LABELS, type LibraryBookSummary, type LibraryEntry, type LibraryStatus } from "@/lib/library-types";

const STATUS_ORDER: LibraryStatus[] = ["want", "reading", "done"];

export function BookSpine({
  id,
  title,
  authorLabel,
  year,
  fileType,
  progressPage,
  progressTotal,
  onRemove,
}: {
  id: string;
  title: string;
  authorLabel: string;
  year: string | null;
  fileType: string;
  progressPage?: number | null;
  progressTotal?: number | null;
  onRemove?: () => void;
}) {
  const accent = spineAccent(id);
  // A touch of per-book height/width jitter (derived from the same id, so it
  // stays stable across renders) so neighbouring spines don't look printed
  // from one mould — closer to how real hardbacks vary on a shelf.
  const jitter = (id.charCodeAt(0) + id.charCodeAt(id.length - 1)) % 5;
  const href =
    progressPage && progressPage > 1
      ? `/documents/${id}?page=${progressPage}`
      : `/documents/${id}`;
  return (
    <div className="group/spine relative shrink-0" style={{ width: 128 + jitter }}>
      <Link
        href={href}
        className="relative flex w-full flex-col justify-between overflow-hidden rounded-t-md rounded-b-sm p-3 shadow-[0_6px_14px_rgba(25,31,40,0.18)] transition-transform duration-200 group-hover/spine:-translate-y-1.5"
        style={{
          height: 182 + jitter * 2,
          background: `linear-gradient(160deg, ${accent} 0%, ${accent}cc 100%)`,
        }}
      >
        <span className="font-mono text-[9px] uppercase tracking-widest text-paper/70">
          {fileType}
          {progressPage && progressPage > 1
            ? ` · ${progressPage}${progressTotal ? `/${progressTotal}` : ""}`
            : ""}
        </span>
        <div>
          <p className="line-clamp-4 font-serif text-[13px] leading-[1.15] text-paper">{title}</p>
          <p className="mt-1.5 truncate text-[10px] text-paper/75">
            {authorLabel}
            {year ? `, ${year}` : ""}
          </p>
        </div>
      </Link>
      {onRemove && (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            onRemove();
          }}
          aria-label="Убрать с полки"
          className="absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full border border-ink/10 bg-paper text-muted opacity-0 shadow-sm transition-opacity hover:text-rust group-hover/spine:opacity-100"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

export function ShelfRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative pb-5">
      <div className="flex items-end gap-4 overflow-x-auto pb-2">{children}</div>
      <div className="absolute inset-x-0 bottom-2 h-2 rounded-full bg-gradient-to-b from-ink/15 to-ink/5" />
      <div className="absolute inset-x-0 bottom-0 h-[3px] rounded-full bg-ink/20" />
    </div>
  );
}

export function Bookshelf({
  entries: initialEntries,
  readOnly = false,
  emptyLabel,
}: {
  entries: LibraryEntry[];
  /** True when showing someone else's shelf — hides the remove control and skips the write call. */
  readOnly?: boolean;
  emptyLabel?: string;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const router = useRouter();

  async function remove(documentId: string) {
    setEntries((prev) => prev.filter((entry) => entry.document.id !== documentId));
    await fetch(`/api/library/${documentId}`, { method: "DELETE" });
    router.refresh();
  }

  const byStatus = new Map<LibraryStatus, LibraryEntry[]>();
  for (const status of STATUS_ORDER) byStatus.set(status, []);
  for (const entry of entries) byStatus.get(entry.status)?.push(entry);

  if (entries.length === 0) {
    return (
      <p className="border-t border-ink/10 py-10 text-sm text-muted">
        {emptyLabel ??
          "Полка пуста — на странице книги нажмите «В библиотеку», чтобы отметить, что хотите прочитать, читаете сейчас или уже прочитали."}
      </p>
    );
  }

  return (
    <div className="space-y-10">
      {STATUS_ORDER.map((status) => {
        const items = byStatus.get(status) ?? [];
        if (items.length === 0) return null;
        return (
          <div key={status}>
            <div className="mb-4 flex items-baseline justify-between">
              <p className="eyebrow">{LIBRARY_STATUS_LABELS[status]}</p>
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted">{items.length}</span>
            </div>
            <ShelfRow>
              {items.map((entry) => (
                <BookSpine
                  key={entry.itemId}
                  id={entry.document.id}
                  title={entry.document.title}
                  authorLabel={entry.document.authors.map((a) => a.name).join(", ") || "автор не указан"}
                  year={entry.document.year}
                  fileType={entry.document.fileType}
                  progressPage={entry.progressPage}
                  progressTotal={entry.progressTotal}
                  onRemove={readOnly ? undefined : () => remove(entry.document.id)}
                />
              ))}
            </ShelfRow>
          </div>
        );
      })}
    </div>
  );
}

export function PopularShelf({ books }: { books: { document: LibraryBookSummary; shelvedCount: number }[] }) {
  if (books.length === 0) return null;
  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <p className="eyebrow">Популярное на сайте</p>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
          чаще всего добавляют на полку
        </span>
      </div>
      <ShelfRow>
        {books.map(({ document, shelvedCount }) => (
          <div key={document.id} className="relative shrink-0">
            <BookSpine
              id={document.id}
              title={document.title}
              authorLabel={document.authors.map((a) => a.name).join(", ") || "автор не указан"}
              year={document.year}
              fileType={document.fileType}
            />
            <span className="absolute -left-1.5 -top-1.5 grid size-6 place-items-center rounded-full border border-ink/10 bg-paper text-[10px] font-mono shadow-sm">
              {shelvedCount}
            </span>
          </div>
        ))}
      </ShelfRow>
    </div>
  );
}

export function RecommendationShelf({ books }: { books: LibraryBookSummary[] }) {
  if (books.length === 0) return null;
  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <p className="eyebrow">Может понравиться</p>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
          по темам вашей полки
        </span>
      </div>
      <ShelfRow>
        {books.map((book) => (
          <BookSpine
            key={book.id}
            id={book.id}
            title={book.title}
            authorLabel={book.authors.map((a) => a.name).join(", ") || "автор не указан"}
            year={book.year}
            fileType={book.fileType}
          />
        ))}
      </ShelfRow>
    </div>
  );
}
