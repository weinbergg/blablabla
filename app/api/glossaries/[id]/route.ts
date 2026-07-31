import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { deleteGlossary, getGlossary, updateGlossary } from "@/lib/db/glossaries";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const user = await getCurrentUser();
  const { id } = await context.params;
  const glossary = await getGlossary(id, user?.id ?? null);
  if (!glossary) return NextResponse.json({ error: "Словарь не найден." }, { status: 404 });
  return NextResponse.json({ glossary });
}

export async function PUT(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется вход." }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null);

  const ok = await updateGlossary(id, user.id, {
    title: typeof body?.title === "string" ? body.title : undefined,
    description: body?.description !== undefined ? body.description : undefined,
    language: body?.language !== undefined ? body.language : undefined,
    visibility: body?.visibility === "public" || body?.visibility === "private" ? body.visibility : undefined,
  });
  if (!ok) return NextResponse.json({ error: "Нельзя изменить этот словарь." }, { status: 403 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется вход." }, { status: 401 });
  const { id } = await context.params;
  const ok = await deleteGlossary(id, user.id);
  if (!ok) return NextResponse.json({ error: "Нельзя удалить этот словарь." }, { status: 403 });
  return NextResponse.json({ ok: true });
}
