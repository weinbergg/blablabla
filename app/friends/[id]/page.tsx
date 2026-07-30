import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { Header } from "@/components/header";
import { ShelfCompare } from "@/components/shelf-compare";
import { getCurrentUser } from "@/lib/auth";
import { areFriends, getUserPublicInfo } from "@/lib/db/friends";
import { getLibraryForUser } from "@/lib/db/library";

export const dynamic = "force-dynamic";

export default async function FriendLibraryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id: friendId } = await params;

  if (friendId === user.id) redirect("/library");

  const [friend, friends] = await Promise.all([
    getUserPublicInfo(friendId),
    areFriends(user.id, friendId),
  ]);
  if (!friend || !friends) notFound();

  const [mine, theirs] = await Promise.all([
    getLibraryForUser(user.id),
    getLibraryForUser(friendId),
  ]);

  return (
    <>
      <Header />
      <main className="shell py-12 md:py-16">
        <Link
          href="/friends"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={15} />
          Все друзья
        </Link>
        <p className="eyebrow mb-3">Сравнение полок</p>
        <h1 className="mb-10 font-serif text-4xl tracking-tight">Вы и {friend.name}</h1>
        <ShelfCompare mine={mine} theirs={theirs} friendName={friend.name} />
      </main>
    </>
  );
}
