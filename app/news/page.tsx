import Link from "next/link";
import { Header } from "@/components/header";
import { ChannelComposer } from "@/components/channel-composer";
import { ChannelPostBody } from "@/components/channel-post-body";
import { getCurrentUser } from "@/lib/auth";
import { ensureNewsChannelForSite, formatWhen, listChannelPosts } from "@/lib/db/channels";

export const dynamic = "force-dynamic";

export default async function NewsPage() {
  const user = await getCurrentUser();
  const channel = await ensureNewsChannelForSite();
  const posts = channel ? await listChannelPosts(channel.id) : [];
  const canWrite = user?.role === "admin" && Boolean(channel);

  return (
    <>
      <Header />
      <main className="shell py-12 md:py-16">
        <p className="eyebrow mb-3">Библиотека</p>
        <h1 className="font-serif text-4xl tracking-tight md:text-5xl">Новости</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
          Хроника фонда, встреч и оцифровки. Это колонка, не лента статусов: у каждой
          записи есть заголовок и текст, который читают целиком.
        </p>
        <p className="mt-3 text-sm text-muted">
          Авторские каналы читателей —{" "}
          <Link href="/channels" className="underline underline-offset-2 hover:text-ink">
            отдельным списком
          </Link>
          .
        </p>

        <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div>
            {posts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-ink/15 px-5 py-10 text-sm text-muted">
                <p className="font-medium text-ink">Пока тишина.</p>
                <p className="mt-2 leading-6">Первая запись появится, когда будет что сказать по делу.</p>
              </div>
            ) : (
              <ol className="space-y-10">
                {posts.map((post) => (
                  <li key={post.id} className={post.pinned ? "border-l-2 border-rust pl-5" : ""}>
                    {post.pinned ? <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-rust">Закреплено</p> : null}
                    <Link href={`/news/${post.slug}`} className="group block">
                      <h2 className="font-serif text-2xl tracking-tight group-hover:text-rust">{post.title}</h2>
                      <p className="mt-1 text-xs text-muted">
                        {formatWhen(post.createdAt)}
                        {post.documentTitle ? ` · ${post.documentTitle}` : ""}
                      </p>
                    </Link>
                    <div className="mt-4 max-w-2xl">
                      <ChannelPostBody text={excerpt(post.body)} />
                    </div>
                    {post.body.trim().length > 480 ? (
                      <Link href={`/news/${post.slug}`} className="mt-3 inline-block text-sm text-muted underline underline-offset-2 hover:text-ink">
                        Читать целиком
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </div>
          <aside>
            {canWrite && channel ? (
              <ChannelComposer
                channelId={channel.id}
                isNews
                postHref={(slug) => `/news/${slug}`}
              />
            ) : (
              <p className="text-sm leading-6 text-muted">
                Пишут только те, кто ведёт библиотеку. Читать можно без билета.
              </p>
            )}
          </aside>
        </div>
      </main>
    </>
  );
}

function excerpt(text: string) {
  const trimmed = text.trim();
  if (trimmed.length <= 480) return trimmed;
  return `${trimmed.slice(0, 480).trimEnd()}…`;
}
