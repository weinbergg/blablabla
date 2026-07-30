import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { MessagesInbox } from "@/components/messages-inbox";
import { getCurrentUser } from "@/lib/auth";
import { getConversationsForUser } from "@/lib/db/messages";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const conversations = await getConversationsForUser(user.id);

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
        <h1 className="mb-8 font-serif text-4xl tracking-tight">Сообщения</h1>
        <MessagesInbox conversations={conversations} currentUserId={user.id} />
      </main>
    </>
  );
}
