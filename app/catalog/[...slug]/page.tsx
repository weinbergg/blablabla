import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { notFound } from "next/navigation";
import { CategoryCard } from "@/components/category-card";
import { CategoryDocumentList } from "@/components/category-document-list";
import { Header } from "@/components/header";
import { categoryAccent } from "@/lib/category-style";
import {
  getCategoryBySlugPath,
  getCategoryTree,
  getChildCategories,
  getDocumentsForCategory,
  isPubliclyVisibleCategory,
} from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const resolved = await getCategoryBySlugPath(slug);
  if (!resolved) notFound();

  const { category, trail } = resolved;
  const [children, documents, tree] = await Promise.all([
    getChildCategories(category.id),
    getDocumentsForCategory(category.id),
    getCategoryTree(),
  ]);

  const visibleChildren = children.filter(isPubliclyVisibleCategory);
  const accent = categoryAccent(category.id);
  const trailHrefs = trail.map(
    (item, index) => `/catalog/${trail.slice(0, index + 1).map((t) => t.slug).join("/")}`,
  );

  return (
    <>
      <Header />
      <main>
        <section className="border-b border-ink/10">
          <div className="shell py-12 md:py-16">
            <Link
              href="/#catalog"
              className="mb-8 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
            >
              <ArrowLeft size={15} />
              Все разделы
            </Link>

            <nav className="mb-6 flex flex-wrap items-center gap-1.5 text-xs text-muted">
              {trail.map((item, index) => (
                <span key={item.id} className="flex items-center gap-1.5">
                  {index > 0 && <span>/</span>}
                  <Link href={trailHrefs[index]} className="hover:text-ink">
                    {item.name}
                  </Link>
                </span>
              ))}
            </nav>

            <div className="flex items-center gap-4">
              <span
                className="grid size-14 shrink-0 place-items-center rounded-full font-serif text-2xl"
                style={{ backgroundColor: `${accent}18`, color: accent }}
              >
                {category.name.charAt(0).toUpperCase()}
              </span>
              <h1 className="font-serif text-[clamp(2.5rem,6vw,4.5rem)] leading-none tracking-[-0.04em]">
                {category.name}
              </h1>
            </div>
            {category.description && (
              <p className="mt-6 max-w-xl text-lg leading-7 text-muted">
                {category.description}
              </p>
            )}
          </div>
        </section>

        <div className="shell py-14 md:py-20">
          {visibleChildren.length > 0 && (
            <div className="mb-16">
              <p className="eyebrow mb-5">Подразделы</p>
              <div className="grid border-b border-l border-ink/10 sm:grid-cols-2 lg:grid-cols-3">
                {visibleChildren.map((child, index) => (
                  <CategoryCard
                    key={child.id}
                    category={{ ...child, children: [] }}
                    href={`${trailHrefs[trailHrefs.length - 1]}/${child.slug}`}
                    index={index}
                  />
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="mb-3 flex items-baseline justify-between">
              <p className="eyebrow">Материалы в этом разделе</p>
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
                {documents.length}
              </span>
            </div>
            {documents.length ? (
              <CategoryDocumentList documents={documents} />
            ) : (
              <p className="border-t border-ink/10 py-7 text-sm text-muted">
                {visibleChildren.length
                  ? "В самом разделе материалов пока нет — загляните в подразделы выше."
                  : "Раздел пока пуст — материалы появятся позже."}
              </p>
            )}
          </div>

          {tree.length > 0 && (
            <div className="mt-16 border-t border-ink/10 pt-8">
              <Link
                href="/graph"
                className="group inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
              >
                Посмотреть, как разделы и авторы связаны между собой
                <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
