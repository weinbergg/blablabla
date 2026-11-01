import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isUploadedFile } from "@/lib/community-files";
import { listMusicTracks, saveMusicUpload } from "@/lib/db/music";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (user?.role !== "admin") return null;
  return user;
}

export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Доступ только для админов" }, { status: 403 });
  const tracks = await listMusicTracks();
  return NextResponse.json({
    tracks: tracks.map((row) => ({
      id: row.id,
      title: row.title,
      composer: row.composer,
      status: row.status,
      createdAt: row.createdAt,
    })),
  });
}

export async function POST(request: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Доступ только для админов" }, { status: 403 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const title = typeof form?.get("title") === "string" ? String(form.get("title")) : "";
  const composer = typeof form?.get("composer") === "string" ? String(form.get("composer")) : "";
  if (!isUploadedFile(file)) {
    return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
  }
  try {
    const saved = await saveMusicUpload({ userId: user.id, title, composer, file });
    return NextResponse.json(saved, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось сохранить" },
      { status: 400 },
    );
  }
}
