import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { RoomWorkspace } from "@/components/room-workspace";
import { getCurrentUser } from "@/lib/auth";
import { getRoom, roomRights } from "@/lib/db/rooms";
import { featureEnabled } from "@/lib/features";
import { clientIpFrom, readHrefFor, viewerKeyFor } from "@/lib/file-access";
import { canAnnotateFiles } from "@/lib/roles";
export const dynamic = "force-dynamic";
export default async function ReadTogetherPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/seminars/${slug}/read`)}`);
  if (!await featureEnabled("rooms", user)) notFound();
  const room = await getRoom(slug, true); if (!room) notFound();
  if ((room.accessMode === "paid" || room.priceKopeks > 0) && !(await featureEnabled("paid_events", user))) notFound(); const rights = roomRights(room, user);
  if (!rights.read) redirect(`/seminars/${slug}`);
  const viewer = viewerKeyFor(user.id, clientIpFrom(await headers()));
  const url = room.documentId ? await readHrefFor(room.documentId, viewer) : null;
  return <RoomWorkspace currentUserId={user.id} initialRights={rights} fileUrl={url} canAnnotate={canAnnotateFiles(user.role)} room={{ id: room.id, slug: room.slug, title: room.title, hostName: room.hostName, hostUserId: room.hostUserId, documentId: room.documentId, documentTitle: room.documentTitle, documentType: room.documentType, language: room.language, body: room.body, summary: room.summary, meetUrl: room.meetUrl, discussionLocked: room.discussionLocked }} />;
}
