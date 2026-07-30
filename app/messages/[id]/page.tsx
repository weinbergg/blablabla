import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { Header } from "@/components/header";
import { MessageThread } from "@/components/message-thread";
import { getCurrentUser } from "@/lib/auth";
import { getConversationMessages, getConversationParticipants, isConversationParticipant } from "@/lib/db/messages";

export const dynamic = "force-dynamic";

export default async function MessageThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  if (!(await isConversationParticipant(id, user.id))) notFound();

  const [messages, participants] = await Promise.all([
    getConversationMessages(id),
    getConversationParticipants(id),
  ]);
  const otherParticipants = participants.filter((p) => p.id !== user.id);
  const title = otherParticipants.length
    ? otherParticipants.map((p) => p.name).join(", ")
    : "Заметки для себя";

  return (
    <>
      <Header />
      <main className="shell py-12 md:py-16">
        <Link
          href="/messages"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={15} />
          Все сообщения
        </Link>
        <h1 className="mb-6 font-serif text-3xl tracking-tight">{title}</h1>
        <MessageThread conversationId={id} initialMessages={messages} currentUserId={user.id} />
      </main>
    </>
  );
}
