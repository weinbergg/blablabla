import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getFriendsData, sendFriendRequest } from "@/lib/db/friends";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется вход." }, { status: 401 });
  const data = await getFriendsData(user.id);
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется вход." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const addresseeId = typeof body?.userId === "string" ? body.userId : null;
  if (!addresseeId) return NextResponse.json({ error: "Не указан пользователь." }, { status: 400 });

  let result: { friendshipId: string; status: "pending" | "accepted" };
  try {
    result = await sendFriendRequest(user.id, addresseeId);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
  const data = await getFriendsData(user.id);
  return NextResponse.json({
    ok: true,
    friendshipId: result.friendshipId,
    status: result.status,
    accepted: result.status === "accepted",
    ...data,
  });
}
