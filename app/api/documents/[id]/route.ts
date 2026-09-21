import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { deleteDocumentById, updateDocument } from "@/lib/document-form";
import { db } from "@/lib/db/client";
import { documentEdits, documents } from "@/lib/db/schema";
import { isAdminRole, uploadLimitBytes } from "@/lib/roles";

export const maxDuration = 600;

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const { id } = await context.params;
  const [existing] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!existing) {
    return NextResponse.json({ error: "Материал не найден" }, { status: 404 });
  }

  try {
    const formData = await request.formData();
    await updateDocument(formData, existing, user.id, uploadLimitBytes(user.role));
    revalidatePath("/");
    revalidatePath(`/documents/${id}`);
    revalidatePath("/admin");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Не удалось сохранить изменения.",
      },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user || !isAdminRole(user.role)) {
    return NextResponse.json({ error: "Нужны права администратора." }, { status: 401 });
  }

  const { id } = await context.params;
  const [existing] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!existing) {
    return NextResponse.json({ error: "Материал не найден" }, { status: 404 });
  }

  const payload = (await request.json().catch(() => null)) as { confidence?: string } | null;
  const next = payload?.confidence;
  if (next !== "confirmed" && next !== "low") {
    return NextResponse.json({ error: "Некорректный статус." }, { status: 400 });
  }
  if (existing.confidence === next) {
    return NextResponse.json({ ok: true });
  }

  await db
    .update(documents)
    .set({ confidence: next, updatedAt: new Date().toISOString() })
    .where(eq(documents.id, id));
  await db.insert(documentEdits).values({
    id: randomUUID(),
    documentId: id,
    editorId: user.id,
    field: "confidence",
    oldValue: existing.confidence,
    newValue: next,
  });
  revalidatePath("/");
  revalidatePath(`/documents/${id}`);
  revalidatePath("/admin");
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (user?.role !== "admin") {
    return NextResponse.json({ error: "Требуется вход администратора" }, { status: 401 });
  }

  const { id } = await context.params;
  const [existing] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!existing) {
    return NextResponse.json({ error: "Материал не найден" }, { status: 404 });
  }

  await deleteDocumentById(existing);
  revalidatePath("/");
  revalidatePath("/admin");
  return NextResponse.json({ ok: true });
}
