import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/header";
import { ForumReplyForm } from "@/components/forum-reply-form";
import { MathText } from "@/components/math-text";
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
          <h1 className="font-serif text-3xl tracking-tight md:text-4xl">{topic.title}</h1>
          <p className="mt-3 text-sm text-muted">
            {topic.authorName}
            {" · "}
            {new Date(topic.createdAt).toLocaleString("ru-RU")}
            {topic.documentId && topic.documentTitle && (
              <>
                {" · "}
                <Link href={`/documents/${topic.documentId}`} className="text-ink underline-offset-2 hover:underline">
                  {topic.documentTitle}
                </Link>
              </>
            )}
          </p>
          <MathText source={topic.body} className="mt-6 text-base leading-7" />

          <div className="mt-10 space-y-6 border-t border-ink/10 pt-8">
            <h2 className="font-serif text-2xl tracking-tight">Ответы</h2>
            {posts.length === 0 && (
              <p className="text-sm text-muted">Пока тихо — можно ответить первым.</p>
            )}
            {posts.map((post) => (
              <div key={post.id} className="border-t border-ink/10 pt-4 first:border-t-0 first:pt-0">
                <p className="text-xs text-muted">
                  <span className="font-medium text-ink">{post.authorName}</span>
                  {" · "}
                  {new Date(post.createdAt).toLocaleString("ru-RU")}
                </p>
                <MathText source={post.body} className="mt-2 text-sm leading-6" />
              </div>
            ))}
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
