import { notFound } from "next/navigation";
import ChannelPostPage from "@/app/channels/[slug]/[postSlug]/page";
import { getNewsChannel } from "@/lib/db/channels";
export const dynamic = "force-dynamic";
export default async function NewsPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const channel = await getNewsChannel(); if (!channel) notFound();
  return ChannelPostPage({ params: Promise.resolve({ slug: channel.slug, postSlug: (await params).slug }) });
}
