import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { categories, documents } from "@/lib/db/schema";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (user?.role !== "admin") {
    return NextResponse.json({ error: "Требуется вход администратора" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    name?: unknown;
    description?: unknown;
  } | null;

  const updates: Partial<typeof categories.$inferInsert> = {};
  if (typeof body?.name === "string" && body.name.trim()) {
    updates.name = body.name.trim();
  }
  if (typeof body?.description === "string") {
    updates.description = body.description.trim() || null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Нечего сохранять." }, { status: 400 });
  }

  await db.update(categories).set(updates).where(eq(categories.id, id));
  revalidatePath("/");
  revalidatePath("/admin");
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (user?.role !== "admin") {
    return NextResponse.json({ error: "Требуется вход администратора" }, { status: 401 });
  }

  const { id } = await context.params;

  const [hasChild] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.parentId, id))
    .limit(1);
  if (hasChild) {
    return NextResponse.json(
      { error: "Сначала удалите или перенесите подразделы." },
      { status: 400 },
    );
  }

  const [hasDocument] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.categoryId, id))
    .limit(1);
  if (hasDocument) {
    return NextResponse.json(
      { error: "В разделе есть материалы — сначала перенесите их." },
      { status: 400 },
    );
  }

  await db.delete(categories).where(eq(categories.id, id));
  revalidatePath("/");
  revalidatePath("/admin");
  return NextResponse.json({ ok: true });
}
