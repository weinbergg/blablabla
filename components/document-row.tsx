import Link from "next/link";
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
    <article className="grid grid-cols-[1fr_auto] items-baseline gap-5 border-t border-ink/10 py-5 md:grid-cols-[1.3fr_.8fr_auto]">
      <Link href={`/documents/${document.id}`} className="min-w-0">
        {showCategory && category && (
          <span className="mb-1 block text-xs text-rust">{category.name}</span>
        )}
        <h3 className="truncate font-serif text-xl tracking-tight md:text-[22px]">
          {document.title}
        </h3>
        <p className="mt-1 truncate text-sm text-muted">
          {authorNames || "Автор не указан"}
          {document.year ? `, ${document.year}` : ""}
          {document.confidence === "low" && (
            <span className="ml-2 text-xs text-rust">уточняется</span>
          )}
        </p>
      </Link>

      <div className="hidden text-sm text-muted md:block">
        <p>
          {document.fileType}
          {document.pages ? ` · ${document.pages} стр.` : ""}
          {document.language ? ` · ${languageLabel(document.language)}` : ""}
          {document.secondaryLanguage ? ` / ${languageLabel(document.secondaryLanguage)}` : ""}
        </p>
      </div>

      <div className="flex items-center gap-3 text-sm">
        {document.fileUrl && (
          <a
            href={`/api/files/${document.id}?mode=download`}
            download={document.fileName || undefined}
            className="text-muted hover:text-ink"
          >
            скачать
          </a>
        )}
        <Link href={`/documents/${document.id}`} className="text-rust hover:underline">
          открыть
        </Link>
      </div>
    </article>
  );
}
