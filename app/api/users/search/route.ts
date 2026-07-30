import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { searchUsers } from "@/lib/db/messages";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const results = await searchUsers(query, user.id);
  return NextResponse.json({ users: results });
}
