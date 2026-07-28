import Link from "next/link";
import { ArrowLeft, Tag as TagIcon } from "lucide-react";
import { notFound } from "next/navigation";
import { DocumentRow } from "@/components/document-row";
import { Header } from "@/components/header";
import { countLabel } from "@/lib/pluralize";
import { getTagBySlug } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function TagPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const resolved = await getTagBySlug(slug);
  if (!resolved) notFound();

  const { tag, documents } = resolved;

  return (
    <>
      <Header />
      <main>
        <section className="border-b border-ink/10">
          <div className="shell py-12 md:py-16">
            <Link
              href="/tags"
              className="mb-8 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
            >
              <ArrowLeft size={15} />
              Все метки
            </Link>

            <div className="flex items-center gap-4">
              <span className="grid size-14 shrink-0 place-items-center rounded-full bg-rust/12 text-rust">
                <TagIcon size={22} />
              </span>
              <h1 className="font-serif text-[clamp(2.5rem,6vw,4.5rem)] leading-none tracking-[-0.04em]">
                {tag.name}
              </h1>
            </div>
          </div>
        </section>

        <div className="shell py-14 md:py-20">
          <div className="mb-3 flex items-baseline justify-between">
            <p className="eyebrow">Тексты с этой меткой</p>
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
              Пока нет материалов с этой меткой.
            </p>
          )}
        </div>
      </main>
    </>
  );
}
