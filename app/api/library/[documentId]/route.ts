import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { addOrUpdateLibraryItem, removeLibraryItem, type LibraryStatus } from "@/lib/db/library";

const VALID_STATUSES: LibraryStatus[] = ["want", "reading", "done"];

export async function PATCH(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется вход." }, { status: 401 });
  const { documentId } = await params;

  const body = await request.json().catch(() => null);
  if (!VALID_STATUSES.includes(body?.status)) {
    return NextResponse.json({ error: "Некорректный статус." }, { status: 400 });
  }
  const note = typeof body?.note === "string" ? body.note.slice(0, 2000) : undefined;

  await addOrUpdateLibraryItem({ userId: user.id, documentId, status: body.status, note });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется вход." }, { status: 401 });
  const { documentId } = await params;
  await removeLibraryItem(user.id, documentId);
  return NextResponse.json({ ok: true });
}
