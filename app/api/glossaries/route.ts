import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createGlossary, listGlossariesForUser } from "@/lib/db/glossaries";

export async function GET() {
  const user = await getCurrentUser();
  const glossaries = await listGlossariesForUser(user?.id ?? null);
  return NextResponse.json({ glossaries });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется вход." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title || title.length > 120) {
    return NextResponse.json({ error: "Укажите название словаря (до 120 символов)." }, { status: 400 });
  }

  const visibility = body?.visibility === "public" ? "public" : "private";
  const id = await createGlossary({
    ownerId: user.id,
    title,
    description: typeof body?.description === "string" ? body.description : null,
    language: typeof body?.language === "string" ? body.language : null,
    visibility,
  });

  return NextResponse.json({ ok: true, id });
}
