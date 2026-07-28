import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { annotations } from "@/lib/db/schema";

const SHAPES = new Set(["note", "star", "flag", "question", "heart", "quote"]);
const VISIBILITIES = new Set(["public", "private"]);

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const { id } = await context.params;
  const [annotation] = await db.select().from(annotations).where(eq(annotations.id, id)).limit(1);
  if (!annotation) {
    return NextResponse.json({ error: "Пометка не найдена" }, { status: 404 });
  }
  if (annotation.authorId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Нет прав." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    shape?: unknown;
    color?: unknown;
    body?: unknown;
    visibility?: unknown;
  } | null;

  const updates: Partial<typeof annotations.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };
  if (typeof body?.shape === "string" && SHAPES.has(body.shape)) {
    updates.shape = body.shape as typeof annotations.$inferInsert.shape;
  }
  if (typeof body?.color === "string") updates.color = body.color.slice(0, 20);
  if (typeof body?.body === "string") updates.body = body.body.trim().slice(0, 800);
  if (typeof body?.visibility === "string" && VISIBILITIES.has(body.visibility)) {
    updates.visibility = body.visibility as typeof annotations.$inferInsert.visibility;
  }

  await db.update(annotations).set(updates).where(eq(annotations.id, id));
  revalidatePath(`/documents/${annotation.documentId}`);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const { id } = await context.params;
  const [annotation] = await db.select().from(annotations).where(eq(annotations.id, id)).limit(1);
  if (!annotation) {
    return NextResponse.json({ error: "Пометка не найдена" }, { status: 404 });
  }
  if (annotation.authorId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Нет прав." }, { status: 403 });
  }

  await db.delete(annotations).where(eq(annotations.id, id));
  revalidatePath(`/documents/${annotation.documentId}`);
  return NextResponse.json({ ok: true });
}
