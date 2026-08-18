import Link from "next/link";
import { Header } from "@/components/header";
import { ForumTopicForm } from "@/components/forum-topic-form";
import { UserAvatar } from "@/components/user-avatar";
import { getCurrentUser } from "@/lib/auth";
import { listForumTopics } from "@/lib/db/forum";
import { countLabel } from "@/lib/pluralize";

export const dynamic = "force-dynamic";

export default async function DiscussPage({
  searchParams,
}: {
  searchParams: Promise<{ documentId?: string; title?: string }>;
}) {
  const user = await getCurrentUser();
  const params = await searchParams;
  const topics = await listForumTopics(50);

  return (
    <>
      <Header />
      <main className="shell py-12 md:py-16">
        <p className="eyebrow mb-3">Разговоры</p>
        <h1 className="font-serif text-4xl tracking-tight md:text-5xl">Обсуждения</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
          Общий стол для тем, которые не умещаются в комментарии к одной странице:
          сравнения изданий, сквозные мотивы, вопросы между разделами каталога.
          Комментарии под книгой остаются для точных мест в тексте.
        </p>

        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div>
            {topics.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-ink/15 px-5 py-10 text-sm text-muted">
                <p className="font-medium text-ink">Пока нет открытых тем.</p>
                <p className="mt-2 leading-6">
                  Первая может быть вашей — без тестовых заглушек, только живой разговор.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-ink/10">
                {topics.map((topic) => (
                  <li key={topic.id}>
                    <Link
                      href={`/discuss/${topic.id}`}
                      className="group block py-4 transition-colors hover:text-rust"
                    >
                      <span className="block font-serif text-xl leading-snug tracking-tight group-hover:underline group-hover:underline-offset-2">
                        {topic.title}
                      </span>
                      <span className="mt-1.5 flex items-center gap-2 text-xs text-muted">
                        <UserAvatar
                          userId={topic.authorId}
                          avatarKey={topic.authorAvatarKey}
                          name={topic.authorName}
                          size={18}
                        />
                        {topic.authorName}
                        {" · "}
                        {new Date(topic.createdAt).toLocaleDateString("ru-RU")}
                        {" · "}
                        {countLabel(Number(topic.replyCount) || 0, ["ответ", "ответа", "ответов"])}
                        {topic.documentTitle ? ` · ${topic.documentTitle}` : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <aside>
            {user ? (
              <ForumTopicForm
                documentId={params.documentId ?? null}
                documentTitle={params.title ?? null}
              />
            ) : (
              <div className="rounded-2xl border border-ink/10 p-5 text-sm text-muted">
                Чтобы открыть тему,{" "}
                <Link href="/login" className="font-medium text-ink underline">
                  войдите
                </Link>
                .
              </div>
            )}
          </aside>
        </div>
      </main>
    </>
  );
}
