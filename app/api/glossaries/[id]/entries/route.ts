import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { addGlossaryEntry } from "@/lib/db/glossaries";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется вход." }, { status: 401 });

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const term = typeof body?.term === "string" ? body.term : "";
  const definition = typeof body?.definition === "string" ? body.definition : "";
  if (!term.trim() || !definition.trim()) {
    return NextResponse.json({ error: "Нужны термин и определение." }, { status: 400 });
  }

  const entryId = await addGlossaryEntry({
    glossaryId: id,
    ownerId: user.id,
    term,
    definition,
    notes: typeof body?.notes === "string" ? body.notes : null,
    aliases: typeof body?.aliases === "string" ? body.aliases : null,
  });

  if (!entryId) {
    return NextResponse.json({ error: "Нельзя добавить запись в этот словарь." }, { status: 403 });
  }
  return NextResponse.json({ ok: true, id: entryId });
}
