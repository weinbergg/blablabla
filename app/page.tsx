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
          <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
            <div className="hero-orbit" />
          </div>
          <div className="shell relative pb-24 pt-20 text-center md:pb-32 md:pt-28">
            <p className="eyebrow mb-7">Библиотека · с 2026 года</p>
            <h1 className="mx-auto max-w-5xl font-serif text-[clamp(3.2rem,8vw,6.6rem)] leading-[0.9] tracking-[-0.045em]">
              Собрание текстов по <span className="italic text-rust">математике</span>,
              <span className="block">философии и истории.</span>
            </h1>
            <p className="mx-auto mt-8 max-w-xl text-base leading-7 text-muted md:text-lg">
              Личная подборка книг и статей — от первоисточников до
              современных исследований.
            </p>

            <div className="mt-10">
              <LibrarySearch documents={searchable} totalCount={totalDocuments} />
            </div>
          </div>
        </section>

        <section id="catalog" className="shell py-20 md:py-28">
          <div className="mb-10 flex items-end justify-between">
            <div>
              <p className="eyebrow mb-3">Разделы</p>
              <h2 className="font-serif text-4xl tracking-tight md:text-5xl">
                Вся библиотека
              </h2>
            </div>
            <p className="hidden max-w-xs text-right text-sm leading-6 text-muted md:block">
              Каждый раздел делится на подразделы — с произвольной глубиной.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-ink/10 bg-ink/10 sm:grid-cols-2 lg:grid-cols-3">
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

        <section className="bg-[#17202c] text-[#f7f4ed]">
          <div className="shell py-20 md:py-28">
            <div className="mb-9 flex items-end justify-between">
              <div>
                <p className="eyebrow mb-3 text-[#f7f4ed]/50">Новые поступления</p>
                <h2 className="font-serif text-4xl tracking-tight md:text-5xl">
                  Недавно добавлено
                </h2>
              </div>
              <span className="hidden font-mono text-[10px] uppercase tracking-widest text-[#f7f4ed]/40 sm:block">
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
          <p className="font-mono uppercase tracking-widest">
            Философия · История · Математика
          </p>
        </div>
      </footer>
    </>
  );
}
