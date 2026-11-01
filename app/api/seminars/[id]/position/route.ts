import { NextResponse } from "next/server";
import { roomContext } from "@/lib/room-api";
import { sqlite } from "@/lib/db/client";
import { validateAnchor } from "@/lib/publication-content";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const loaded = await roomContext((await context.params).id); if (loaded.response) return loaded.response;
  return NextResponse.json({ ok: true, position: loaded.room.readingState ? JSON.parse(loaded.room.readingState) : null, locked: !!loaded.room.discussionLocked, status: loaded.room.status }, { headers: { "Cache-Control": "private, no-store" } });
}
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const loaded = await roomContext((await context.params).id, "host"); if (loaded.response) return loaded.response;
  const input = await request.json().catch(() => null);
  try {
    if (!input || input.documentId !== loaded.room.documentId || !Number.isInteger(input.page) || input.page < 1 || input.page > 100000) throw new Error("Некорректная позиция чтения");
    const anchor = input.anchor ? validateAnchor(input.anchor) : null;
    if (anchor && anchor.documentId !== loaded.room.documentId) throw new Error("Цитата относится к другой книге");
    const position = { documentId: loaded.room.documentId, page: input.page, anchor, updatedAt: new Date().toISOString() };
    sqlite.prepare("UPDATE seminars SET reading_state=? WHERE id=?").run(JSON.stringify(position), loaded.room.id);
    return NextResponse.json({ ok: true, position });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Не удалось изменить позицию" }, { status: 400 }); }
}
