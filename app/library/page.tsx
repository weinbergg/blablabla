import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { Bookshelf, PopularShelf, RecommendationShelf } from "@/components/bookshelf";
import { getCurrentUser } from "@/lib/auth";
import { getLibraryForUser, getPopularBooks, getRecommendationsForUser } from "@/lib/db/library";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [entries, recommendations, popular] = await Promise.all([
    getLibraryForUser(user.id),
    getRecommendationsForUser(user.id),
    getPopularBooks(),
  ]);

  return (
    <>
      <Header />
      <main className="shell py-12 md:py-16">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={15} />
          Вернуться в библиотеку
        </Link>
        <p className="eyebrow mb-3">Личное</p>
        <h1 className="mb-2 font-serif text-4xl tracking-tight">Моя полка</h1>
        <p className="mb-10 max-w-xl text-sm leading-6 text-muted">
          Книги, которые вы отметили на страницах текстов — что хотите прочитать, что уже
          читаете и что закончили. Сравнить полку с другом можно на странице{" "}
          <Link href="/friends" className="underline underline-offset-2 hover:text-ink">
            «Друзья»
          </Link>
          .
        </p>

        <Bookshelf entries={entries} />

        {recommendations.length > 0 && (
          <div className="mt-14 border-t border-ink/10 pt-10">
            <RecommendationShelf books={recommendations} />
          </div>
        )}

        {popular.length > 0 && (
          <div className="mt-14 border-t border-ink/10 pt-10">
            <PopularShelf books={popular} />
          </div>
        )}
      </main>
    </>
  );
}
