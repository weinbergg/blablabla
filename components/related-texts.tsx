import Link from "next/link";

type RelatedDoc = {
  id: string;
  title: string;
  year: string | null;
  authors: { name: string }[];
  relation?: string;
};

/** Nearby texts by author / tags / subject — not the whole Gutenberg shelf. */
export function RelatedTexts({
  documents,
  currentDocumentId,
}: {
  documents: RelatedDoc[];
  currentDocumentId?: string;
}) {
  if (!documents.length) return null;

  return (
    <section className="mt-12 border-t border-ink/10 pt-10">
      <h2 className="font-serif text-2xl tracking-tight">Рядом по смыслу</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
        Другие произведения того же автора или общий предмет. Переводы и издания этой
        же книги собраны блоком выше, а не смешаны с соседями по полке.
      </p>
      <ul className="mt-6 divide-y divide-ink/10">
        {documents.map((doc) => {
          const authorNames = doc.authors.map((a) => a.name).join(", ");
          return (
            <li key={doc.id} className="flex items-baseline justify-between gap-4 py-3.5">
              <Link
                href={`/documents/${doc.id}`}
                className="group min-w-0 transition-colors hover:text-rust"
              >
                <span className="block font-medium leading-snug group-hover:underline group-hover:underline-offset-2">
                  {doc.title}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted">
                  {doc.relation ? `${doc.relation} · ` : ""}
                  {authorNames || "Автор не указан"}
                  {doc.year ? `, ${doc.year}` : ""}
                </span>
              </Link>
              {currentDocumentId && (
                <Link
                  href={`/documents/${currentDocumentId}?with=${doc.id}`}
                  className="shrink-0 text-xs text-muted hover:text-ink"
                >
                  Рядом
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
