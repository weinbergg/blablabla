import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/header";
import { ChannelComposer } from "@/components/channel-composer";
import { ChannelPostBody } from "@/components/channel-post-body";
import { UserAvatar } from "@/components/user-avatar";
import { getCurrentUser } from "@/lib/auth";
import {
  canPostToChannel,
  formatWhen,
  getChannelBySlug,
  listChannelPosts,
} from "@/lib/db/channels";

export const dynamic = "force-dynamic";

export default async function ChannelPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const channel = await getChannelBySlug(slug);
  if (!channel) notFound();
  if (channel.kind === "news") redirect("/news");

  const user = await getCurrentUser();
  const posts = await listChannelPosts(channel.id);
  const canWrite = user ? canPostToChannel(channel, user) : false;

  return (
    <>
      <Header />
      <main className="shell py-12 md:py-16">
        <Link
          href="/channels"
          className="mb-8 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={15} />
          Все каналы
        </Link>

        <div className="flex items-start gap-4">
          <UserAvatar
            userId={channel.ownerId}
            avatarKey={channel.ownerAvatarKey}
            avatarColor={channel.ownerAvatarColor}
            name={channel.ownerName}
            size={56}
          />
          <div>
            <p className="eyebrow mb-2">Канал</p>
            <h1 className="font-serif text-4xl tracking-tight">{channel.title}</h1>
            <p className="mt-2 text-sm text-muted">
              <Link href={`/users/${channel.ownerId}`} className="underline-offset-2 hover:underline">
                {channel.ownerName}
              </Link>
            </p>
            {channel.description ? (
              <p className="mt-3 max-w-2xl text-base leading-7 text-muted">{channel.description}</p>
            ) : null}
          </div>
        </div>

        <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div>
            {posts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-ink/15 px-5 py-10 text-sm text-muted">
                Пока нет записей.
              </div>
            ) : (
              <ol className="space-y-10">
                {posts.map((post) => (
                  <li key={post.id}>
                    <Link href={`/channels/${channel.slug}/${post.slug}`} className="group block">
                      <h2 className="font-serif text-2xl tracking-tight group-hover:text-rust">{post.title}</h2>
                      <p className="mt-1 text-xs text-muted">
                        {formatWhen(post.createdAt)}
                        {post.documentTitle ? ` · ${post.documentTitle}` : ""}
                      </p>
                    </Link>
                    <div className="mt-4 max-w-2xl">
                      <ChannelPostBody text={excerpt(post.body)} />
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <aside>
            {canWrite ? (
              <ChannelComposer
                channelId={channel.id}
                isNews={false}
                postHref={(postSlug) => `/channels/${channel.slug}/${postSlug}`}
              />
            ) : null}
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
