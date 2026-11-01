import { notFound, redirect } from "next/navigation";
import { Header } from "@/components/header";
import { ChannelComposer } from "@/components/channel-composer";
import { getCurrentUser } from "@/lib/auth";
import { getChannelBySlug, getChannelPermissions } from "@/lib/db/channels";
import { db } from "@/lib/db/client";
import { channelPosts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { listAttachments } from "@/lib/community-files";
import { legacyDoc, type PublicationBlock } from "@/lib/publication-content";
export const dynamic = "force-dynamic";
export default async function WritePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ post?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const channel = await getChannelBySlug((await params).slug);
  if (!channel || !(await getChannelPermissions(channel, user)).publish) notFound();
  const { post: id } = await searchParams;
  const [post] = id ? await db.select().from(channelPosts).where(eq(channelPosts.id, id)).limit(1) : [];
  if (id && (!post || post.channelId !== channel.id || post.deletedAt)) notFound();
  if (post && !post.contentJson) {
    const files = await listAttachments("channel_post", post.id);
    const blocks: PublicationBlock[] = [{ id: "text", type: "text", doc: legacyDoc(post.body) }];
    if (post.documentId) blocks.push({ id: "book", type: "book", documentId: post.documentId });
    for (const file of files) blocks.push(file.kind === "image" ? { id: file.id, type: "image", files: [{ id: file.id, caption: file.name }] } : file.kind === "video" ? { id: file.id, type: "video", fileId: file.id, caption: file.name } : { id: file.id, type: "file", fileId: file.id, label: file.name });
    post.contentJson = JSON.stringify({ version: 1, blocks });
  }
  return <><Header /><main className="shell py-6 md:py-10"><ChannelComposer key={post?.id ?? "new"} channelId={channel.id} postBase={`/channels/${channel.slug}`} isNews={channel.kind === "news"} currentUserId={user.id} initialPost={post ?? null} /></main></>;
}
