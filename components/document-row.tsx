import Link from "next/link";
import { ArrowDownToLine, ArrowUpRight } from "lucide-react";
import type { AuthorRow, DocumentRow as DocumentRowType } from "@/lib/db/queries";
import { languageLabel } from "@/lib/languages";

type Props = {
  document: DocumentRowType & { authors: AuthorRow[] };
  category?: { name: string };
  showCategory?: boolean;
};

export function DocumentRow({ document, category, showCategory = false }: Props) {
  const authorNames = document.authors.map((author) => author.name).join(", ");

  return (
    <article className="group grid grid-cols-[1fr_auto] items-center gap-5 border-t border-ink/10 py-5 md:grid-cols-[1.3fr_.8fr_auto]">
      <Link href={`/documents/${document.id}`} className="min-w-0">
        {showCategory && category && (
          <span className="mb-2 inline-flex rounded-full bg-ink/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
            {category.name}
          </span>
        )}
        <h3 className="truncate font-serif text-xl tracking-tight md:text-[22px]">
          {document.title}
        </h3>
        <p className="mt-1 truncate text-sm text-muted">
          {authorNames || "Автор не указан"}
          {document.year ? `, ${document.year}` : ""}
          {document.confidence === "low" && (
            <span className="ml-2 text-[10px] uppercase tracking-wide text-rust">
              уточняется
            </span>
          )}
        </p>
      </Link>

      <div className="hidden text-sm text-muted md:block">
        <p className="font-mono text-[10px] uppercase tracking-wider">
          {document.fileType}
          {document.pages ? ` · ${document.pages} стр.` : ""}
          {document.language ? ` · ${languageLabel(document.language)}` : ""}
          {document.secondaryLanguage ? ` / ${languageLabel(document.secondaryLanguage)}` : ""}
        </p>
      </div>

      <div className="flex items-center gap-2">
        {document.fileUrl && (
          <a
            href={document.fileUrl}
            download={document.fileName || undefined}
            className="grid size-10 shrink-0 place-items-center rounded-full border border-ink/15 text-muted transition-all hover:border-ink hover:bg-ink hover:text-paper"
            aria-label={`Скачать ${document.title}`}
          >
            <ArrowDownToLine size={17} />
          </a>
        )}
        <Link
          href={`/documents/${document.id}`}
          className="grid size-10 shrink-0 place-items-center rounded-full border border-ink/15 text-muted transition-all group-hover:border-ink group-hover:bg-ink group-hover:text-paper"
          aria-label={`Открыть ${document.title}`}
        >
          <ArrowUpRight size={17} />
        </Link>
      </div>
    </article>
  );
}
