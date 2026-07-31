import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { FriendsPanel } from "@/components/friends-panel";
import { ActivityFeed } from "@/components/activity-feed";
import { getCurrentUser } from "@/lib/auth";
import { getFriendsData } from "@/lib/db/friends";
import { getFriendActivity } from "@/lib/db/library";

export const dynamic = "force-dynamic";

export default async function FriendsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [data, activity] = await Promise.all([getFriendsData(user.id), getFriendActivity(user.id)]);

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
        <h1 className="mb-2 font-serif text-4xl tracking-tight">Друзья</h1>
        <p className="mb-10 max-w-xl text-sm leading-6 text-muted">
          Добавляйте других читателей библиотеки в друзья, чтобы сравнивать книжные полки и
          находить общий интерес.
        </p>
        <ActivityFeed entries={activity} />
        <FriendsPanel data={data} currentUserId={user.id} />
      </main>
    </>
  );
}
