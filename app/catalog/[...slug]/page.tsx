import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { notFound } from "next/navigation";
import { CategoryCard } from "@/components/category-card";
import { CategoryDocumentList } from "@/components/category-document-list";
import { Header } from "@/components/header";
import { SectionArchiveButton } from "@/components/section-archive-button";
import { getCurrentUser } from "@/lib/auth";
import { getEntitlements } from "@/lib/db/billing";
import { hasFeature } from "@/lib/entitlements";
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
  const user = await getCurrentUser();
  const [children, documents, tree, entitlements] = await Promise.all([
    getChildCategories(category.id),
    getDocumentsForCategory(category.id),
    getCategoryTree(),
    getEntitlements(user),
  ]);

  const visibleChildren = children.filter(isPubliclyVisibleCategory);
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

            <h1 className="display">{category.name}</h1>
            {category.description && (
              <p className="mt-6 max-w-xl text-lg leading-7 text-muted">
                {category.description}
              </p>
            )}

            {documents.length > 0 && (
              <div className="mt-8">
                <SectionArchiveButton
                  categoryId={category.id}
                  allowed={hasFeature(entitlements, "archive.zip")}
                />
              </div>
            )}
          </div>
        </section>

        <div className="shell py-14 md:py-20">
          {visibleChildren.length > 0 && (
            <div className="mb-16">
              <p className="eyebrow mb-5">Подразделы</p>
              <div className="grid grid-cols-1 gap-px overflow-hidden border border-ink/10 bg-ink/10 sm:grid-cols-2 lg:grid-cols-3">
                {visibleChildren.map((child, index) => (
                  <CategoryCard
                    key={child.id}
                    category={{ ...child, children: [] }}
                    href={`${trailHrefs[trailHrefs.length - 1]}/${child.slug}`}
                    wide={visibleChildren.length % 3 === 1 && index === visibleChildren.length - 1}
                  />
                ))}
              </div>
            </div>
          )}

          {(documents.length > 0 || visibleChildren.length === 0) && (
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
                  Раздел пока пуст — материалы появятся позже.
                </p>
              )}
            </div>
          )}

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
