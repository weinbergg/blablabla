import { CategoryCard } from "@/components/category-card";
import { SiteFooter } from "@/components/site-footer";
import { DocumentRow } from "@/components/document-row";
import { Header } from "@/components/header";
import { LibrarySearch, type SearchableDocument } from "@/components/library-search";
import { SeminarCard } from "@/components/seminar-card";
import { listPublicSeminars } from "@/lib/db/events";
import {
  getAllDocumentsForSearch,
  getCategoryTree,
  getRecentDocuments,
  isPubliclyVisibleCategory,
} from "@/lib/db/queries";
import { isWideGridTail } from "@/lib/category-style";
import { countLabel } from "@/lib/pluralize";
import Link from "next/link";

export const dynamic = "force-dynamic";

function flattenCategories(nodes: Awaited<ReturnType<typeof getCategoryTree>>) {
  const map = new Map<string, { name: string; slug: string; path: string }>();
  const walk = (list: typeof nodes, trail: string[]) => {
    for (const node of list) {
      const next = [...trail, node.name];
      map.set(node.id, { name: node.name, slug: node.slug, path: next.join(" · ") });
      walk(node.children, next);
    }
  };
  walk(nodes, []);
  return map;
}

export default async function Home() {
  const [tree, allDocuments, recentDocuments, upcomingSessions] = await Promise.all([
    getCategoryTree(),
    getAllDocumentsForSearch(),
    getRecentDocuments(6),
    listPublicSeminars({ when: "upcoming" }),
  ]);

  const categoryById = flattenCategories(tree);
  const totalDocuments = allDocuments.length;
  const visibleTree = tree
    .filter(isPubliclyVisibleCategory)
    .map((category) => ({ ...category, children: category.children.filter(isPubliclyVisibleCategory) }));
  const sessions = upcomingSessions.slice(0, 4);

  const searchable: SearchableDocument[] = allDocuments.map((doc) => ({
    id: doc.id,
    title: doc.title,
    alternateTitle: doc.alternateTitle,
    authorNames: doc.authors.map((a) => a.name).join(", "),
    subjectNames: doc.subjects.map((s) => s.name).join(", "),
    categoryName: categoryById.get(doc.categoryId)?.name ?? "",
    categoryPath: categoryById.get(doc.categoryId)?.path ?? "",
    tagNames: doc.tags.map((t) => t.name).join(", "),
    language: doc.language,
  }));

  return (
    <>
      <Header />
      <main>
        <section className="border-b border-ink/10">
          <div className="shell pb-16 pt-14 text-center md:pb-20 md:pt-16">
            <p className="eyebrow">Библиотека</p>
            <h1 className="mx-auto mt-6 max-w-5xl font-serif text-[clamp(3.2rem,8vw,6.6rem)] leading-[0.9] tracking-[-0.045em]">
              Собрание текстов по <span className="italic text-rust">математике</span>,
              <span className="block">философии и истории.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-muted">
              Личная подборка книг и статей — от первоисточников до современных исследований.
              Читать можно без оплаты.
            </p>
            <div className="mx-auto mt-10 max-w-2xl">
              <LibrarySearch documents={searchable} totalCount={totalDocuments} />
            </div>
            <p className="mt-5 text-sm text-muted">
              {countLabel(totalDocuments, ["текст", "текста", "текстов"])}
              {" · "}
              {countLabel(visibleTree.length, ["раздел", "раздела", "разделов"])}
            </p>
          </div>
        </section>

        {sessions.length > 0 && (
          <section className="border-b border-ink/10">
            <div className="shell py-14 md:py-16">
              <div className="mb-2 flex items-end justify-between gap-4">
                <div>
                  <p className="eyebrow mb-3">Расписание</p>
                  <h2 className="display-md">Ближайшие чтения</h2>
                </div>
                <Link href="/seminars" className="text-sm text-muted hover:text-ink">
                  Все встречи
                </Link>
              </div>
              <div className="mt-6">
                {sessions.map((seminar) => (
                  <SeminarCard key={seminar.id} seminar={seminar} />
                ))}
              </div>
            </div>
          </section>
        )}

        <section id="catalog" className="shell py-16 md:py-24">
          <div className="mb-10 flex items-end justify-between">
            <div>
              <p className="eyebrow mb-3">Разделы</p>
              <h2 className="display">Вся библиотека</h2>
            </div>
            <p className="hidden max-w-xs text-right text-sm leading-6 text-muted md:block">
              Каждый раздел делится на подразделы — с произвольной глубиной.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-px overflow-hidden border border-ink/10 bg-ink/10 sm:grid-cols-2 lg:grid-cols-3">
            {visibleTree.map((category, index) => (
              <CategoryCard
                key={category.id}
                category={category}
                href={`/catalog/${category.slug}`}
                wide={isWideGridTail(index, visibleTree.length)}
              />
            ))}
          </div>
        </section>

        <section className="border-t border-ink/10">
          <div className="shell py-16 md:py-20">
            <p className="eyebrow mb-3">Недавно</p>
            <h2 className="display-md">Новые поступления</h2>
            <div className="mt-8">
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

      <SiteFooter />
    </>
  );
}
