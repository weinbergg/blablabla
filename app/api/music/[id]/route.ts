import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getMusicTrack, musicFilePath } from "@/lib/db/music";
import { getSiteConfig } from "@/lib/db/settings";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const track = await getMusicTrack(id);
  if (!track) return NextResponse.json({ error: "Запись не найдена" }, { status: 404 });

  const user = await getCurrentUser();
  const isAdmin = user?.role === "admin";
  if (track.status !== "approved" && !isAdmin) {
    return NextResponse.json({ error: "Запись ещё не одобрена" }, { status: 403 });
  }
  if (track.status === "approved") {
    const config = await getSiteConfig();
    if (!config.musicEnabled && !isAdmin) {
      return NextResponse.json({ error: "Музыка на сайте выключена" }, { status: 404 });
    }
  }

  const full = musicFilePath(track.storedName);
  if (!full) return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
  try {
    const bytes = await readFile(full);
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": track.mime,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
  }
}
