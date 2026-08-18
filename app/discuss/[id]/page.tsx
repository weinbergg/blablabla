import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/header";
import { ForumReplyForm } from "@/components/forum-reply-form";
import { ForumThread } from "@/components/forum-thread";
import { MathText } from "@/components/math-text";
import { RoleBadge, UserAvatar } from "@/components/user-avatar";
import { getCurrentUser } from "@/lib/auth";
import { getForumTopic } from "@/lib/db/forum";

export const dynamic = "force-dynamic";

export default async function DiscussTopicPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getForumTopic(id);
  if (!data) notFound();
  const user = await getCurrentUser();
  const { topic, posts } = data;

  return (
    <>
      <Header />
      <main className="shell py-12 md:py-16">
        <Link
          href="/discuss"
          className="mb-8 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={15} />
          Все обсуждения
        </Link>

        <article className="max-w-3xl">
          <div className="topic-card">
            <h1 className="font-serif text-3xl tracking-tight md:text-4xl">{topic.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">
            <UserAvatar
              userId={topic.authorId}
              avatarKey={topic.authorAvatarKey}
              avatarColor={topic.authorAvatarColor}
              name={topic.authorName}
              size={32}
            />
            <span className="font-medium text-ink">{topic.authorName}</span>
            <RoleBadge role={topic.authorRole} />
            <span>· {new Date(topic.createdAt).toLocaleString("ru-RU")}</span>
            {topic.documentId && topic.documentTitle && (
              <>
                <span>·</span>
                <Link href={`/documents/${topic.documentId}`} className="text-ink underline-offset-2 hover:underline">
                  {topic.documentTitle}
                </Link>
              </>
            )}
          </div>
          <MathText source={topic.body} className="mt-6 text-base leading-7" />
          </div>

          <div className="mt-10 space-y-6 border-t border-ink/10 pt-8">
            <h2 className="font-serif text-2xl tracking-tight">Ответы</h2>
            <ForumThread
              topicId={topic.id}
              posts={posts}
              currentUserId={user?.id ?? null}
              locked={Boolean(topic.locked)}
            />
          </div>

          {user ? (
            topic.locked ? (
              <p className="mt-8 text-sm text-muted">Тема закрыта.</p>
            ) : (
              <ForumReplyForm topicId={topic.id} />
            )
          ) : (
            <p className="mt-8 text-sm text-muted">
              Чтобы ответить,{" "}
              <Link href="/login" className="font-medium text-ink underline">
                войдите
              </Link>
              .
            </p>
          )}
        </article>
      </main>
    </>
  );
}
