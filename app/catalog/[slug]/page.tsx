import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { CategoryIcon } from "@/components/category-icon";
import { DocumentRow } from "@/components/document-row";
import { Header } from "@/components/header";
import { getLibrary } from "@/lib/library";

export const dynamic = "force-dynamic";

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getLibrary();
  const category = data.categories.find((item) => item.slug === slug);

  if (!category) notFound();

  const subcategories = data.subcategories.filter(
    (item) => item.categoryId === category.id,
  );
  const documents = data.documents.filter(
    (document) => document.categoryId === category.id,
  );

  return (
    <>
      <Header />
      <main>
        <section className="border-b border-ink/10">
          <div className="shell py-12 md:py-20">
            <Link
              href="/#catalog"
              className="mb-12 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
            >
              <ArrowLeft size={15} />
              Все направления
            </Link>
            <div className="grid gap-10 md:grid-cols-[1fr_auto] md:items-end">
              <div>
                <p className="eyebrow mb-4">Раздел {category.index}</p>
                <h1 className="font-serif text-[clamp(4rem,9vw,7rem)] leading-none tracking-[-0.05em]">
                  {category.name}
                </h1>
                <p className="mt-6 max-w-xl text-lg leading-7 text-muted">
                  {category.description}
                </p>
              </div>
              <CategoryIcon
                category={category.id}
                size={112}
                strokeWidth={0.7}
                style={{ color: category.accent }}
                className="hidden md:block"
              />
            </div>
          </div>
        </section>

        <div className="shell grid gap-12 py-16 md:grid-cols-[220px_1fr] md:py-24">
          <aside>
            <p className="eyebrow mb-5">Содержание</p>
            <nav className="space-y-1">
              {subcategories.map((subcategory) => {
                const count = documents.filter(
                  (document) => document.subcategoryId === subcategory.id,
                ).length;
                return (
                  <a
                    key={subcategory.id}
                    href={`#${subcategory.id}`}
                    className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-ink/5"
                  >
                    <span>{subcategory.name}</span>
                    <span className="font-mono text-[10px] text-muted">
                      {String(count).padStart(2, "0")}
                    </span>
                  </a>
                );
              })}
            </nav>
          </aside>

          <div className="min-w-0">
            {subcategories.map((subcategory) => {
              const sectionDocuments = documents.filter(
                (document) => document.subcategoryId === subcategory.id,
              );

              return (
                <section
                  key={subcategory.id}
                  id={subcategory.id}
                  className="scroll-mt-8 pb-16 last:pb-0"
                >
                  <div className="mb-3 flex items-baseline justify-between">
                    <h2 className="font-serif text-3xl tracking-tight">
                      {subcategory.name}
                    </h2>
                    <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
                      {sectionDocuments.length} материалов
                    </span>
                  </div>
                  {sectionDocuments.length ? (
                    sectionDocuments.map((document) => (
                      <DocumentRow
                        key={document.id}
                        document={document}
                        category={category}
                        subcategory={subcategory}
                      />
                    ))
                  ) : (
                    <p className="border-t border-ink/10 py-7 text-sm text-muted">
                      Этот раздел пока пуст — материалы появятся позже.
                    </p>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      </main>
    </>
  );
}
