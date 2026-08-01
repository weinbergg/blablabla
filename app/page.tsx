import { AntoineMark } from "@/components/antoine-mark";
import { CategoryCard } from "@/components/category-card";
import { DocumentRow } from "@/components/document-row";
import { Header } from "@/components/header";
import { LibrarySearch, type SearchableDocument } from "@/components/library-search";
import {
  getAllDocumentsForSearch,
  getCategoryTree,
  getRecentDocuments,
  isPubliclyVisibleCategory,
} from "@/lib/db/queries";
import { isWideGridTail } from "@/lib/category-style";

export const dynamic = "force-dynamic";

function flattenCategories(nodes: Awaited<ReturnType<typeof getCategoryTree>>) {
  const map = new Map<string, { name: string; slug: string }>();
  const walk = (list: typeof nodes) => {
    for (const node of list) {
      map.set(node.id, { name: node.name, slug: node.slug });
      walk(node.children);
    }
  };
  walk(nodes);
  return map;
}

export default async function Home() {
  const [tree, allDocuments, recentDocuments] = await Promise.all([
    getCategoryTree(),
    getAllDocumentsForSearch(),
    getRecentDocuments(6),
  ]);

  const categoryById = flattenCategories(tree);
  const totalDocuments = allDocuments.length;
  const visibleTree = tree
    .filter(isPubliclyVisibleCategory)
    .map((category) => ({ ...category, children: category.children.filter(isPubliclyVisibleCategory) }));

  const searchable: SearchableDocument[] = allDocuments.map((doc) => ({
    id: doc.id,
    title: doc.title,
    alternateTitle: doc.alternateTitle,
    authorNames: doc.authors.map((a) => a.name).join(", "),
    categoryName: categoryById.get(doc.categoryId)?.name ?? "",
    tagNames: doc.tags.map((t) => t.name).join(", "),
  }));

  return (
    <>
      <Header />
      <main>
        <section className="relative border-b border-ink/10">
          <div className="shell relative pb-20 pt-16 text-center md:pb-28 md:pt-24">
            <p className="brand-mark brand-in mx-auto max-w-5xl text-[clamp(3.4rem,9vw,7.2rem)] text-ink">
              blablablarden
            </p>
            <h1 className="brand-in-delay mx-auto mt-6 max-w-2xl font-serif text-[clamp(1.35rem,2.8vw,1.85rem)] font-normal leading-snug tracking-tight text-ink/90">
              Собрание текстов по математике, философии и истории
            </h1>
            <p className="brand-in-delay-2 mx-auto mt-4 max-w-lg text-[15px] leading-7 text-muted md:text-base">
              Личная подборка — от первоисточников до современных исследований.
            </p>

            <div className="brand-in-delay-2 mt-10">
              <LibrarySearch documents={searchable} totalCount={totalDocuments} />
            </div>
          </div>
        </section>

        <section id="catalog" className="shell py-20 md:py-28">
          <div className="mb-10 flex items-end justify-between gap-6">
            <div>
              <p className="eyebrow mb-3">Разделы</p>
              <h2 className="font-serif text-4xl font-normal tracking-tight md:text-5xl">
                Вся библиотека
              </h2>
            </div>
            <p className="hidden max-w-xs text-right text-sm leading-6 text-muted md:block">
              Каждый раздел делится на подразделы — с произвольной глубиной.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-px overflow-hidden border border-ink/12 bg-ink/12 sm:grid-cols-2 lg:grid-cols-3">
            {visibleTree.map((category, index) => (
              <CategoryCard
                key={category.id}
                category={category}
                href={`/catalog/${category.slug}`}
                index={index}
                wide={isWideGridTail(index, visibleTree.length)}
              />
            ))}
          </div>
        </section>

        <section className="bg-ink text-paper">
          <div className="shell py-20 md:py-28">
            <div className="mb-9 flex items-end justify-between gap-6">
              <div>
                <p className="eyebrow mb-3 text-paper/50">Новые поступления</p>
                <h2 className="font-serif text-4xl font-normal tracking-tight md:text-5xl">
                  Недавно добавлено
                </h2>
              </div>
              <span className="hidden font-mono text-[11px] uppercase tracking-[0.12em] text-paper/40 sm:block">
                Обновляется регулярно
              </span>
            </div>

            <div className="dark-list">
              {recentDocuments.map((document) => (
                <DocumentRow
                  key={document.id}
                  document={document}
                  category={categoryById.get(document.categoryId)}
                  showCategory
                />
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-ink/10">
        <div className="shell flex flex-col gap-4 py-8 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2">
            <AntoineMark className="size-4 shrink-0 opacity-70" />
            © 2026 blablablarden. Личная электронная библиотека.
          </p>
          <p className="font-mono text-[11px] uppercase tracking-[0.12em]">
            Философия · История · Математика
          </p>
        </div>
      </footer>
    </>
  );
}
