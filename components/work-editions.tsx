import Link from "next/link";
import { languageLabel } from "@/lib/languages";
import type { WorkGroup } from "@/lib/db/works";

export function WorkEditions({
  work,
  currentDocumentId,
  compact = false,
}: {
  work: WorkGroup;
  currentDocumentId?: string;
  compact?: boolean;
}) {
  const others = currentDocumentId
    ? work.editions.filter((item) => item.id !== currentDocumentId)
    : work.editions;
  if (!others.length) return null;

  return (
    <section className={compact ? "border-t border-ink/10 pt-8" : "mt-12 border-t border-ink/10 pt-10"}>
      <h2 className="font-serif text-2xl tracking-tight">Издания и переводы</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
        Одно произведение — «{work.title}». Файлы не склеены: каждый перевод и каждое
        издание остаются отдельной книгой.
      </p>
      <ul className="mt-6 divide-y divide-ink/10">
        {others.map((item) => (
          <li key={item.id}>
            <Link
              href={`/documents/${item.id}`}
              className="group flex items-baseline justify-between gap-4 py-3.5 transition-colors hover:text-rust"
            >
              <span className="min-w-0">
                <span className="block font-medium leading-snug group-hover:underline group-hover:underline-offset-2">
                  {item.title}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted">
                  {item.roleLabel}
                  {item.language ? ` · ${languageLabel(item.language)}` : ""}
                  {` · ${item.fileType}`}
                  {item.year ? `, ${item.year}` : ""}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
