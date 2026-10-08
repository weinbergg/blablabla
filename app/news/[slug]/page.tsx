import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/header";
import { ChannelPostActions } from "@/components/channel-post-actions";
import { ChannelPostBody } from "@/components/channel-post-body";
import { getCurrentUser } from "@/lib/auth";
import { canModerateChannel, formatWhen, getNewsChannel, getPostBySlug } from "@/lib/db/channels";

export const dynamic = "force-dynamic";

export default async function NewsPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const channel = await getNewsChannel();
  if (!channel) notFound();
  const post = await getPostBySlug(channel.id, slug);
  if (!post || post.published !== 1) notFound();
  const user = await getCurrentUser();
  const canModerate = user ? canModerateChannel(channel, user) : false;

  return (
    <>
      <Header />
      <main className="shell py-12 md:py-16">
        <Link
          href="/news"
          className="mb-8 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={15} />
          Все новости
        </Link>
        <article className="max-w-2xl">
          {post.pinned ? <p className="mb-3 text-[10px] uppercase tracking-[0.2em] text-rust">Закреплено</p> : null}
          <h1 className="font-serif text-4xl tracking-tight">{post.title}</h1>
          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span>{post.authorName}</span>
            <span>{formatWhen(post.createdAt)}</span>
            {canModerate ? <ChannelPostActions postId={post.id} afterHref="/news" /> : null}
          </p>
          {post.documentId && post.documentTitle ? (
            <p className="mt-4 text-sm">
              К записи:{" "}
              <Link href={`/documents/${post.documentId}`} className="underline underline-offset-2 hover:text-rust">
                {post.documentTitle}
              </Link>
            </p>
          ) : null}
          <div className="mt-8">
            <ChannelPostBody text={post.body} />
          </div>
        </article>
      </main>
    </>
  );
}
