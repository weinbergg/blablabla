import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/header";
import { RoomEditor } from "@/components/room-editor";
import { getCurrentUser } from "@/lib/auth";
import { featureEnabled } from "@/lib/features";
export const dynamic = "force-dynamic";
export default async function NewRoomPage({ searchParams }: { searchParams: Promise<{ book?: string }> }) {
  const user = await getCurrentUser(); if (!user) redirect("/login?next=/seminars/new");
  if (!await featureEnabled("rooms", user) || !await featureEnabled("room_creation", user)) notFound();
  const { book } = await searchParams;
  const { getDocumentById } = await import("@/lib/db/queries");
  const document = book ? await getDocumentById(book) : null;
  return <><Header /><main className="shell py-8 md:py-12"><Link href="/seminars" className="mb-8 inline-block text-sm text-muted">← Читательские комнаты</Link><RoomEditor userId={user.id} initial={document ? { title: "", summary: "", body: "", kind: "reading", accessMode: "open", documentId: document.id, documentTitle: document.title, startsAt: "", seatLimit: "", meetUrl: "", status: "draft" } : undefined} /></main></>;
}
