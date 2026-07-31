import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { deleteGlossaryEntry, updateGlossaryEntry } from "@/lib/db/glossaries";

type Context = { params: Promise<{ id: string; entryId: string }> };

export async function PUT(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется вход." }, { status: 401 });
  const { entryId } = await context.params;
  const body = await request.json().catch(() => null);

  const ok = await updateGlossaryEntry(entryId, user.id, {
    term: typeof body?.term === "string" ? body.term : undefined,
    definition: typeof body?.definition === "string" ? body.definition : undefined,
    notes: body?.notes !== undefined ? body.notes : undefined,
    aliases: body?.aliases !== undefined ? body.aliases : undefined,
  });
  if (!ok) return NextResponse.json({ error: "Нельзя изменить эту запись." }, { status: 403 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется вход." }, { status: 401 });
  const { entryId } = await context.params;
  const ok = await deleteGlossaryEntry(entryId, user.id);
  if (!ok) return NextResponse.json({ error: "Нельзя удалить эту запись." }, { status: 403 });
  return NextResponse.json({ ok: true });
}
