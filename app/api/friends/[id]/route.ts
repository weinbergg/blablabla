import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getFriendsData, removeFriendship, respondToFriendRequest } from "@/lib/db/friends";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется вход." }, { status: 401 });
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const action = body?.action === "accept" || body?.action === "decline" ? body.action : null;
  if (!action) return NextResponse.json({ error: "Некорректное действие." }, { status: 400 });

  try {
    const result = await respondToFriendRequest(id, user.id, action);
    const data = await getFriendsData(user.id);
    return NextResponse.json({ ok: true, ...result, ...data });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется вход." }, { status: 401 });
  const { id } = await params;

  try {
    await removeFriendship(id, user.id);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
