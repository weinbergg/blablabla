import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { deleteDocumentById, updateDocument } from "@/lib/document-form";
import { db } from "@/lib/db/client";
import { documents } from "@/lib/db/schema";

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
    await updateDocument(formData, existing, user.id);
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
