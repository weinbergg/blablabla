import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { Header } from "@/components/header";
import { Bookshelf } from "@/components/bookshelf";
import { FriendActionButton } from "@/components/friend-action-button";
import { StarRating } from "@/components/rate-review";
import { getCurrentUser } from "@/lib/auth";
import { getFriendshipStatus, getPublicProfile } from "@/lib/db/friends";
import { getLibraryForUser, getLibraryStats, getReviewsByUser } from "@/lib/db/library";
import { ROLE_LABELS } from "@/lib/roles";
import { countLabel } from "@/lib/pluralize";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  const { id } = await params;

  const profile = await getPublicProfile(id);
  if (!profile) notFound();

  const isSelf = currentUser.id === id;

  const [entries, stats, reviews, friendship] = await Promise.all([
    getLibraryForUser(id),
    getLibraryStats(id),
    getReviewsByUser(id),
    isSelf ? Promise.resolve(null) : getFriendshipStatus(currentUser.id, id),
  ]);

  return (
    <>
      <Header />
      <main className="shell py-12 md:py-16">
        <Link href="/friends" className="mb-6 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink">
          <ArrowLeft size={15} />
          Друзья
        </Link>

        <div className="mb-10 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow mb-3">Профиль читателя</p>
            <h1 className="mb-2 font-serif text-4xl tracking-tight">{profile.name}</h1>
            <p className="text-sm text-muted">
              {ROLE_LABELS[profile.role as keyof typeof ROLE_LABELS] ?? profile.role} · с нами с{" "}
              {new Date(`${profile.createdAt.replace(" ", "T")}Z`).toLocaleDateString("ru-RU", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
          {!isSelf && friendship && <FriendActionButton userId={id} initial={friendship} />}
          {isSelf && (
            <Link href="/account" className="button-secondary">
              Настройки аккаунта
            </Link>
          )}
        </div>

        <div className="mb-12 flex flex-wrap gap-3">
          <div className="rounded-xl bg-ink/5 px-4 py-3">
            <p className="font-mono text-xl">{stats.want}</p>
            <p className="text-xs text-muted">хочет прочитать</p>
          </div>
          <div className="rounded-xl bg-ink/5 px-4 py-3">
            <p className="font-mono text-xl">{stats.reading}</p>
            <p className="text-xs text-muted">читает сейчас</p>
          </div>
          <div className="rounded-xl bg-ink/5 px-4 py-3">
            <p className="font-mono text-xl">{stats.done}</p>
            <p className="text-xs text-muted">прочитано</p>
          </div>
        </div>

        {reviews.length > 0 && (
          <div className="mb-14">
            <p className="eyebrow mb-4">{countLabel(reviews.length, ["отзыв", "отзыва", "отзывов"])}</p>
            <ul className="space-y-4">
              {reviews.map((review) => (
                <li key={review.itemId} className="rounded-xl border border-ink/10 p-4">
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <Link href={`/documents/${review.document.id}`} className="text-sm font-medium hover:text-rust">
                      {review.document.title}
                    </Link>
                    {review.rating && <StarRating value={review.rating} size={12} />}
                  </div>
                  {review.reviewBody && <p className="text-sm leading-6 text-muted">{review.reviewBody}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="eyebrow mb-4">Полка</p>
        <Bookshelf entries={entries} readOnly emptyLabel="Полка пока пуста." />
      </main>
    </>
  );
}
