import { NextResponse } from "next/server";
import { listApprovedMusic } from "@/lib/db/music";
import { getSiteConfig } from "@/lib/db/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = await getSiteConfig();
  if (!config.musicEnabled) {
    return NextResponse.json({ tracks: [] });
  }
  const rows = await listApprovedMusic();
  return NextResponse.json({
    tracks: rows.map((row) => ({
      id: row.id,
      title: row.title,
      composer: row.composer,
    })),
  });
}
