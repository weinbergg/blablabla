import { notFound, redirect } from "next/navigation";
import { Header } from "@/components/header";
import { RoomEditor } from "@/components/room-editor";
import { getCurrentUser } from "@/lib/auth";
import { getRoom, roomRights } from "@/lib/db/rooms";
import { featureEnabled } from "@/lib/features";
export const dynamic = "force-dynamic";
export default async function RoomSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser(); if (!user) redirect("/login");
  if (!await featureEnabled("rooms", user)) notFound();
  const room = await getRoom((await params).slug, true); if (!room || !roomRights(room, user).host) notFound();
  if ((room.accessMode === "paid" || room.priceKopeks > 0) && !(await featureEnabled("paid_events", user))) notFound();
  // HTML datetime-local is converted in the client in the viewer's timezone.
  return <><Header /><main className="shell py-10"><RoomEditor userId={user.id} id={room.id} slug={room.slug} initial={{ title: room.title, summary: room.summary ?? "", body: room.body, kind: room.kind, accessMode: roomRights(room, user).mode, documentId: room.documentId, documentTitle: room.documentTitle, startsAt: room.startsAt ?? "", seatLimit: room.seatLimit?.toString() ?? "", meetUrl: room.meetUrl ?? "", status: room.status }} /></main></>;
}
