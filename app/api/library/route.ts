import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { addOrUpdateLibraryItem, getLibraryForUser, type LibraryStatus } from "@/lib/db/library";

const VALID_STATUSES: LibraryStatus[] = ["want", "reading", "done"];

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется вход." }, { status: 401 });
  const entries = await getLibraryForUser(user.id);
  return NextResponse.json({ entries });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется вход." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const documentId = typeof body?.documentId === "string" ? body.documentId : null;
  const status: LibraryStatus = VALID_STATUSES.includes(body?.status) ? body.status : "want";
  if (!documentId) return NextResponse.json({ error: "Не указана книга." }, { status: 400 });

  await addOrUpdateLibraryItem({ userId: user.id, documentId, status });
  return NextResponse.json({ ok: true });
}
