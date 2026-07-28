import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { DocumentRow } from "@/components/document-row";
import { Header } from "@/components/header";
import { LibrarySearch } from "@/components/library-search";
import { getLibrary } from "@/lib/library";

export const dynamic = "force-dynamic";

export default async function Home() {
  const data = await getLibrary();
  const recentDocuments = [...data.documents]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, 4);

  return (
    <>
      <Header />
      <main>
        <section className="relative overflow-hidden border-b border-ink/10">
          <div className="hero-orbit" aria-hidden="true" />
          <div className="shell relative pb-24 pt-20 text-center md:pb-32 md:pt-28">
            <p className="eyebrow mb-7">Архив знаний · основан в 2026</p>
            <h1 className="mx-auto max-w-5xl font-serif text-[clamp(3.5rem,9vw,7.8rem)] leading-[0.84] tracking-[-0.055em]">
              Собрание текстов
              <span className="block italic text-rust">для тех, кто думает.</span>
            </h1>
            <p className="mx-auto mt-8 max-w-xl text-base leading-7 text-muted md:text-lg">
              Философия, история и математика — от первоисточников до
              современных исследований. Без шума и лишнего.
            </p>

            <div className="mt-10">
              <LibrarySearch
                documents={data.documents}
                categories={data.categories}
                subcategories={data.subcategories}
              />
            </div>
          </div>
        </section>

        <section id="catalog" className="shell py-20 md:py-28">
          <div className="mb-10 flex items-end justify-between">
            <div>
              <p className="eyebrow mb-3">Направления</p>
              <h2 className="font-serif text-4xl tracking-tight md:text-5xl">
                Вся библиотека
              </h2>
            </div>
            <p className="hidden max-w-xs text-right text-sm leading-6 text-muted md:block">
              Три области знания, множество эпох и способов увидеть мир.
            </p>
          </div>

          <div className="grid border-b border-l border-ink/10 md:grid-cols-3">
            {data.categories.map((category) => {
              const documents = data.documents.filter(
                (document) => document.categoryId === category.id,
              );
              const subcategories = data.subcategories.filter(
                (subcategory) => subcategory.categoryId === category.id,
              );

              return (
                <Link
                  key={category.id}
                  href={`/catalog/${category.slug}`}
                  className="category-card group relative min-h-[390px] overflow-hidden border-r border-t border-ink/10 p-7 md:p-9"
                >
                  <div
                    className="category-wash"
                    style={{ backgroundColor: category.accent }}
                  />
                  <div className="relative flex h-full flex-col">
                    <div className="flex items-start justify-between">
                      <span className="font-mono text-xs text-muted">
                        {category.index}
                      </span>
                      <CategoryIcon
                        category={category.id}
                        size={42}
                        strokeWidth={1.2}
                        style={{ color: category.accent }}
                      />
                    </div>
                    <div className="mt-auto pt-20">
                      <h3 className="font-serif text-4xl tracking-tight">
                        {category.name}
                      </h3>
                      <p className="mt-3 max-w-xs text-sm leading-6 text-muted">
                        {category.description}
                      </p>
                      <div className="mt-7 flex items-center justify-between border-t border-ink/10 pt-4">
                        <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
                          {documents.length} текстов · {subcategories.length}{" "}
                          раздела
                        </span>
                        <ArrowRight
                          size={18}
                          className="transition-transform group-hover:translate-x-1"
                        />
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="bg-ink text-paper">
          <div className="shell py-20 md:py-28">
            <div className="mb-9 flex items-end justify-between">
              <div>
                <p className="eyebrow mb-3 text-paper/50">Новые поступления</p>
                <h2 className="font-serif text-4xl tracking-tight md:text-5xl">
                  Недавно добавлено
                </h2>
              </div>
              <span className="hidden font-mono text-[10px] uppercase tracking-widest text-paper/40 sm:block">
                Обновляется регулярно
              </span>
            </div>

            <div className="dark-list">
              {recentDocuments.map((document) => (
                <DocumentRow
                  key={document.id}
                  document={document}
                  category={data.categories.find(
                    (category) => category.id === document.categoryId,
                  )}
                  subcategory={data.subcategories.find(
                    (subcategory) => subcategory.id === document.subcategoryId,
                  )}
                  showCategory
                />
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-ink/10">
        <div className="shell flex flex-col gap-4 py-8 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 blablablarden. Личная электронная библиотека.</p>
          <p className="font-mono uppercase tracking-widest">
            Читать · Думать · Обсуждать
          </p>
        </div>
      </footer>
    </>
  );
}
