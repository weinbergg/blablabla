import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { deleteMusicTrack, setMusicStatus } from "@/lib/db/music";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (user?.role !== "admin") return null;
  return user;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Доступ только для админов" }, { status: 403 });
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { status?: unknown };
  const status = body.status;
  if (status !== "pending" && status !== "approved" && status !== "rejected") {
    return NextResponse.json({ error: "Неизвестный статус" }, { status: 400 });
  }
  const row = await setMusicStatus(id, status);
  if (!row) return NextResponse.json({ error: "Запись не найдена" }, { status: 404 });
  return NextResponse.json({ id: row.id, status: row.status });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Доступ только для админов" }, { status: 403 });
  const { id } = await context.params;
  const ok = await deleteMusicTrack(id);
  if (!ok) return NextResponse.json({ error: "Запись не найдена" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
