import Link from "next/link";
import { ArrowLeft, Network } from "lucide-react";
import { notFound } from "next/navigation";
import { DocumentRow } from "@/components/document-row";
import { Header } from "@/components/header";
import { countLabel } from "@/lib/pluralize";
import { getAuthorBySlug, getRelatedAuthors } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function AuthorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const resolved = await getAuthorBySlug(slug);
  if (!resolved) notFound();

  const { author, documents } = resolved;
  const related = await getRelatedAuthors(author.id, author.id);

  return (
    <>
      <Header />
      <main>
        <section className="border-b border-ink/10">
          <div className="shell py-12 md:py-16">
            <Link
              href="/graph"
              className="mb-8 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
            >
              <ArrowLeft size={15} />
              Граф связей
            </Link>

            <div className="flex items-center gap-4">
              <span className="grid size-14 shrink-0 place-items-center rounded-full bg-[#8a5a9e]/12 font-serif text-2xl text-[#8a5a9e]">
                {author.name.charAt(0).toUpperCase()}
              </span>
              <h1 className="font-serif text-[clamp(2.5rem,6vw,4.5rem)] leading-none tracking-[-0.04em]">
                {author.name}
              </h1>
            </div>
            {author.bio && (
              <p className="mt-6 max-w-xl text-lg leading-7 text-muted">{author.bio}</p>
            )}

            {related.length > 0 && (
              <div className="mt-6 flex flex-wrap items-center gap-2 text-sm text-muted">
                <Network size={14} />
                Связаны:
                {related.map((item) => (
                  <Link
                    key={item.id}
                    href={`/authors/${item.slug}`}
                    className="rounded-full border border-ink/10 px-3 py-1 text-ink transition-colors hover:border-rust/40 hover:text-rust"
                  >
                    {item.name}
                    {item.relationLabel ? ` · ${item.relationLabel}` : ""}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>

        <div className="shell py-14 md:py-20">
          <div className="mb-3 flex items-baseline justify-between">
            <p className="eyebrow">Тексты автора</p>
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
              {countLabel(documents.length, ["текст", "текста", "текстов"])}
            </span>
          </div>
          {documents.length ? (
            documents.map((document) => (
              <DocumentRow
                key={document.id}
                document={document}
                category={document.category ?? undefined}
                showCategory
              />
            ))
          ) : (
            <p className="border-t border-ink/10 py-7 text-sm text-muted">
              У этого автора пока нет материалов на сайте.
            </p>
          )}
        </div>
      </main>
    </>
  );
}
