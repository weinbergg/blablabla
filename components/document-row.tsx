import Link from "next/link";
import { ArrowDownToLine, ArrowUpRight } from "lucide-react";
import type { Category, LibraryDocument, Subcategory } from "@/lib/types";

type Props = {
  document: LibraryDocument;
  category?: Category;
  subcategory?: Subcategory;
  showCategory?: boolean;
};

export function DocumentRow({
  document,
  category,
  subcategory,
  showCategory = false,
}: Props) {
  const actionClass =
    "grid size-10 shrink-0 place-items-center rounded-full border border-ink/15 transition-all group-hover:border-ink group-hover:bg-ink group-hover:text-paper";

  return (
    <article className="group grid grid-cols-[1fr_auto] items-center gap-5 border-t border-ink/10 py-5 md:grid-cols-[1.3fr_.8fr_auto]">
      <div className="min-w-0">
        {showCategory && category && (
          <span
            className="mb-2 inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
            style={{
              color: category.accent,
              backgroundColor: `${category.accent}12`,
            }}
          >
            {category.name}
          </span>
        )}
        <h3 className="truncate font-serif text-xl tracking-tight md:text-[22px]">
          {document.title}
        </h3>
        <p className="mt-1 text-sm text-muted">
          {document.author}
          {document.year ? `, ${document.year}` : ""}
        </p>
      </div>

      <div className="hidden text-sm text-muted md:block">
        <p>{subcategory?.name}</p>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-wider">
          {document.fileType}
          {document.pages ? ` · ${document.pages} стр.` : ""}
        </p>
      </div>

      {document.fileUrl ? (
        <a
          href={document.fileUrl}
          target="_blank"
          rel="noreferrer"
          className={actionClass}
          aria-label={`Открыть ${document.title}`}
        >
          <ArrowDownToLine size={17} />
        </a>
      ) : (
        <Link
          href={`/catalog/${category?.slug || "philosophy"}`}
          className={actionClass}
          aria-label={`Перейти к ${document.title}`}
        >
          <ArrowUpRight size={17} />
        </Link>
      )}
    </article>
  );
}
