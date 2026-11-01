import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/header";
import { PublicationCard } from "@/components/channel-feed";
import { AttachmentList } from "@/components/attachment-list";
import { getCurrentUser } from "@/lib/auth";
import { getChannelBySlug, getPostBySlug } from "@/lib/db/channels";
import { publicationFeed } from "@/lib/db/feed";
import { listAttachments } from "@/lib/community-files";
export const dynamic = "force-dynamic";
export default async function ChannelPostPage({ params }: { params: Promise<{ slug: string; postSlug: string }> }) {
  const { slug, postSlug } = await params; const channel = await getChannelBySlug(slug); if (!channel) notFound();
  const row = await getPostBySlug(channel.id, postSlug); if (!row) notFound();
  const user = await getCurrentUser(); const { posts } = await publicationFeed(user, { postId: row.id }); const post = posts[0]; if (!post) notFound();
  const files = post.contentJson ? [] : await listAttachments("channel_post", post.id);
  return <><Header /><main className="shell py-8 md:py-12"><div className="mx-auto max-w-[46rem]"><Link href={`/channels/${channel.slug}`} className="mb-8 inline-flex items-center gap-2 text-sm text-muted"><ArrowLeft size={15} />{channel.title}</Link><PublicationCard post={post} currentUserId={user?.id ?? null} full />{!!files.length && <AttachmentList items={files} canEdit={post.rights.publish} />}{post.documentId && <div className="mt-10 border-t border-ink/15 pt-6"><p className="font-serif text-2xl">Продолжить чтение</p><div className="mt-4 flex flex-wrap gap-4 text-sm text-rust"><Link href={`/documents/${post.documentId}`}>Открыть книгу →</Link><Link href={`/discuss?documentId=${post.documentId}`}>Обсуждения произведения →</Link><Link href={`/seminars?documentId=${post.documentId}`}>Совместные чтения →</Link></div></div>}</div></main></>;
}
