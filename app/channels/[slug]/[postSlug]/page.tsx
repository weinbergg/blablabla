import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/header";
import { ChannelPostActions } from "@/components/channel-post-actions";
import { ChannelPostBody } from "@/components/channel-post-body";
import { getCurrentUser } from "@/lib/auth";
import { canModerateChannel, formatWhen, getChannelBySlug, getPostBySlug } from "@/lib/db/channels";

export const dynamic = "force-dynamic";

export default async function ChannelPostPage({
  params,
}: {
  params: Promise<{ slug: string; postSlug: string }>;
}) {
  const { slug, postSlug } = await params;
  const channel = await getChannelBySlug(slug);
  if (!channel) notFound();
  if (channel.kind === "news") redirect(`/news/${postSlug}`);

  const post = await getPostBySlug(channel.id, postSlug);
  if (!post || post.published !== 1) notFound();
  const user = await getCurrentUser();
  const canModerate = user ? canModerateChannel(channel, user) : false;

  return (
    <>
      <Header />
      <main className="shell py-12 md:py-16">
        <Link
          href={`/channels/${channel.slug}`}
          className="mb-8 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={15} />
          {channel.title}
        </Link>
        <article className="max-w-2xl">
          <h1 className="font-serif text-4xl tracking-tight">{post.title}</h1>
          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span>{post.authorName}</span>
            <span>{formatWhen(post.createdAt)}</span>
            {canModerate ? (
              <ChannelPostActions postId={post.id} afterHref={`/channels/${channel.slug}`} />
            ) : null}
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
