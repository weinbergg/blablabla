import { NextResponse } from "next/server";
import { roomContext } from "@/lib/room-api";
import { listAttachments } from "@/lib/community-files";
import { sqlite } from "@/lib/db/client";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const loaded = await roomContext((await context.params).id); if (loaded.response) return loaded.response;
  return NextResponse.json({ ok: true, files: await listAttachments("seminar", loaded.room.id) }, { headers: { "Cache-Control": "private, no-store" } });
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const loaded = await roomContext((await context.params).id, "host"); if (loaded.response) return loaded.response;
  try {
    const input = await request.json();
    if (!Array.isArray(input.ids) || input.ids.length > 8 || input.ids.some((id: unknown) => typeof id !== "string")) throw new Error("Выберите до 8 файлов");
    sqlite.transaction(() => {
      for (const id of new Set(input.ids)) {
        const file = sqlite.prepare("SELECT owner_id,parent_id FROM community_attachments WHERE id=?").get(id) as { owner_id: string; parent_id: string | null } | undefined;
        if (!file || file.owner_id !== loaded.user!.id || file.parent_id) throw new Error("Файл недоступен для добавления");
        sqlite.prepare("UPDATE community_attachments SET parent_type='seminar',parent_id=? WHERE id=?").run(loaded.room.id, id);
      }
    }).immediate();
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Не удалось добавить материалы" }, { status: 400 }); }
}
